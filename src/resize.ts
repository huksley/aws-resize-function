import { S3 } from 'aws-sdk'
import * as t from 'io-ts'
import * as Sharp from 'sharp'
import {
  decode,
  urlToBucketName,
  urlToKeyName,
  toThrow,
  noext,
  ext,
  findPayload,
  apiResponse,
} from './util'
import { Context as LambdaContext, APIGatewayEvent, Callback as LambdaCallback } from 'aws-lambda'
import { logger as log, logger } from './logger'
import { config } from './config'
import * as R from 'ramda'

const DEFAULT_FORMAT = 'png'
const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 600
const DEFAULT_CHECK_EXISTS = true
const DEFAULT_ZOOM_OUT = 2
const DEFAULT_DSTS3URL = (s3Url: string) =>
  's3://' +
  urlToBucketName(s3Url) +
  '/thumbnail/' +
  noext(urlToKeyName(s3Url)) +
  '.' +
  ext(urlToKeyName(s3Url))

/**
 * Image crop rectangle. Usually a face to focus on.
 * Values are a 0..1 of total width/height of the image.
 */
export const RectPayload = t.type({
  top: t.number,
  left: t.number,
  width: t.number,
  height: t.number,
})

export type Rect = t.TypeOf<typeof RectPayload>

export const InputPayload = t.intersection([
  t.type({
    // Required s3://bucket/path.jpg
    s3Url: t.string,
  }),
  t.partial({
    // Optional face
    faceRect: RectPayload,
    // Optional target path
    dstS3Url: t.string,
    // Pixel width
    width: t.number,
    // Pixel height
    height: t.number,
    // Target format
    format: t.union([t.literal('png'), t.literal('jpg')]),
    // Check thumbnail exists (only S3 object existence checked)
    checkExists: t.boolean,
    // Produce large image crop than specified by factRect (zoom out), 2 - twice the size
    zoomOut: t.number,
  }),
])

// Typescript input type
export type Input = t.TypeOf<typeof InputPayload>

// Output payload format
export const OutputPayload = InputPayload

export type Output = t.TypeOf<typeof OutputPayload>

const s3 = new S3({
  signatureVersion: 'v4',
  region: config.AWS_REGION,
})

/** Invoked on API Gateway call */
export const postHandler = (
  event: APIGatewayEvent,
  context: LambdaContext,
  callback: LambdaCallback,
) => {
  logger.info(
    'event(' +
      typeof event +
      ') ' +
      JSON.stringify(event, null, 2) +
      ' context ' +
      JSON.stringify(context, null, 2),
  )

  const payload = findPayload(event)
  logger.info(`Using payload`, payload)

  try {
    return resize(decode<Input>(InputPayload, payload))
      .then(result => apiResponse(event, context, callback).success(result))
      .catch(failure =>
        apiResponse(event, context, callback).failure('Failed to resize: ' + failure),
      )
  } catch (error) {
    apiResponse(event, context, callback).failure('Failed to resize: ' + error)
  }
}

/** Invoked on S3 event */
export const s3Handler = async (
  event: APIGatewayEvent,
  context: LambdaContext,
  callback: LambdaCallback,
) => {
  logger.info(
    'event(' +
      typeof event +
      ') ' +
      JSON.stringify(event, null, 2) +
      ' context ' +
      JSON.stringify(context, null, 2),
  )

  const payload = findPayload(event)
  logger.info(`Using payload`, payload)

  try {
    logger.info('Got event', payload)
    const s3Event = payload as AWSLambda.S3Event
    if (s3Event.Records) {
      const processed = (await Promise.all(
        s3Event.Records.map(s3Record => {
          const fileName = s3Record.s3.object.key
          if (fileName.endsWith('.json')) {
            logger.info('Skipping JSON file', s3Record)
            return Promise.resolve(null)
          } else if (fileName.indexOf('-thumbnail') > 0) {
            logger.info('Skipping thumbnail file', s3Record)
            return Promise.resolve(null)
          } else {
            const s3Url = 's3://' + s3Record.s3.bucket.name + '/' + fileName
            return resize({ s3Url })
          }
        }),
      )).filter(v => v !== null)
      apiResponse(event, context, callback).success({ processed: processed.length })
    } else {
      logger.warn('No event records')
      apiResponse(event, context, callback).success({ processed: 0 })
    }
  } catch (err) {
    logger.warn('Failed to process s3 event', err)
    apiResponse(event, context, callback).failure('Failed to process s3 event: ' + err.message)
  }
}

export const resize = (input: Input): Promise<Output> => {
  const extension = ext(input.s3Url)
  const format =
    input.format || (extension !== 'jpg' && extension !== 'png' ? DEFAULT_FORMAT : extension)
  const width = input.width || DEFAULT_WIDTH
  const height = input.height || DEFAULT_HEIGHT
  const dstS3Url = input.dstS3Url || DEFAULT_DSTS3URL(input.s3Url)
  const checkExists = input.checkExists !== undefined ? input.checkExists : DEFAULT_CHECK_EXISTS
  const zoomOut = input.zoomOut || DEFAULT_ZOOM_OUT

  // Convert relative coordinates 0...1 rectangle (1 - 100% of width/height)
  // to pixel related
  const convertRelativeRect = (meta: Sharp.Metadata, rect: Rect): Rect => {
    const result = {
      left: Math.max(0, Math.floor(meta.width! * rect.left)),
      top: Math.max(0, Math.floor(meta.height! * rect.top)),
      width: Math.min(meta.width!, Math.ceil(meta.width! * rect.width)),
      height: Math.min(meta.height!, Math.ceil(meta.height! * rect.height)),
    }

    logger.info(`Converted incoming rect according to the image metadata`, {
      rect,
      result,
      meta: R.pickAll(['width', 'height', 'top', 'left'], meta),
    })
    return result
  }

  // Produce larger rectangle by the following factor (1 - no change, 2 - twice as large)
  const zoomOutRect = (meta: Sharp.Metadata, rect: Rect, factor: number = 2): Rect => {
    const w = rect.width * factor
    const h = rect.height * factor
    const extraw = rect.width * (factor - 1)
    const extrah = rect.height * (factor - 1)
    const result = {
      left: Math.max(0, Math.round(rect.left - extraw / 2)),
      top: Math.max(0, Math.round(rect.top - extrah / 2)),
      width: Math.min(meta.width!, Math.round(w)),
      height: Math.min(meta.height!, Math.round(h)),
    }
    logger.info('Zoom out', {
      rect,
      result,
      factor,
    })
    return result
  }

  // Check S3 bucket what following object exists, returns undefined if not found
  const checkHaveResized = (checkS3Url: string) => {
    log.info('Check object exists', checkS3Url)
    return s3
      .listObjectsV2({
        Bucket: urlToBucketName(checkS3Url),
        Prefix: urlToKeyName(checkS3Url),
        MaxKeys: 1,
      })
      .promise()
      .then(listResponse => {
        if (listResponse.KeyCount === 1) {
          log.info('Thumbnail already exists', listResponse)
          return {
            ...input,
            format,
            dstS3Url: checkS3Url,
            width,
            height,
            checkExists,
            zoomOut,
          }
        } else {
          return undefined
        }
      })
      .catch(err => {
        log.warn('Failed to check existing thumbnail', err)
        throw toThrow(err, 'Failed to check existing thumbnail')
      })
  }

  logger.info(`Resizing ${input.s3Url} to ${width}x${height}`)
  return (checkExists ? checkHaveResized(dstS3Url) : Promise.resolve(undefined)).then(result => {
    if (result !== undefined) {
      return result
    }

    return s3
      .getObject({ Bucket: urlToBucketName(input.s3Url), Key: urlToKeyName(input.s3Url) })
      .promise()
      .then(data => {
        logger.info(`Got object ${JSON.stringify(data.Metadata)}, ${data.ContentLength} bytes`)
        const extract = (sharp: Sharp.Sharp) => {
          return input.faceRect && zoomOut > 1
            ? sharp
                .metadata()
                .then(meta => {
                  logger.info('Extracting face', input.faceRect)
                  return sharp.extract(
                    zoomOutRect(meta!, convertRelativeRect(meta!, input.faceRect!), zoomOut),
                  )
                })
                .catch(err => {
                  log.warn('Failed to extract image metadata', err)
                  throw toThrow(err, 'Failed to extract image metadata')
                })
            : Promise.resolve(sharp)
        }

        return extract(Sharp(data.Body as Buffer)).then(sharp =>
          sharp
            .resize(width, height)
            .toFormat(format)
            .toBuffer()
            .catch(err => {
              log.warn('Failed to resize image', err)
              throw toThrow(err, 'Failed to resize image')
            }),
        )
      })
      .catch(err => {
        log.warn('Failed to download image', err)
        throw toThrow(err, 'Failed to download image')
      })
      .then(buffer => {
        logger.info(`Writing resized image to ${dstS3Url}, ${buffer.length} bytes`)
        return s3
          .putObject({
            Body: buffer,
            Bucket: urlToBucketName(dstS3Url),
            ContentType: format === 'jpg' ? 'image/jpeg' : 'image/' + format,
            Key: urlToKeyName(dstS3Url),
            ACL: config.THUMBNAIL_ACL,
          })
          .promise()
          .catch(err => {
            log.warn('Failed to save resized image', err)
            throw toThrow(err, 'Failed to save resized image')
          })
          .then(putObjectResult => {
            log.info('Saved to file ', putObjectResult)
            return {
              ...input,
              format,
              dstS3Url,
              width,
              height,
              checkExists,
              zoomOut,
            }
          })
      })
  })
}
