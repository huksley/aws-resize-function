import { S3 } from 'aws-sdk'
import * as t from 'io-ts'
const s3 = new S3({
  signatureVersion: 'v4',
})
import * as Sharp from 'sharp'
import { decode, urlToBucketName, urlToKeyName, toThrow, noext, ext } from './util'
import {
  Context as LambdaContext,
  APIGatewayEvent,
  Callback as LambdaCallback,
  S3Event,
} from 'aws-lambda'
import { logger as log, logger } from './logger'

const DEFAULT_FORMAT = 'png'
const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 600
const DEFAULT_DSTS3URL = (s3Url: string) =>
  's3://' +
  urlToBucketName(s3Url) +
  '/' +
  noext(urlToKeyName(s3Url)) +
  '-thumbnail' +
  '.' +
  ext(urlToKeyName(s3Url))

export const InputPayload = t.intersection([
  t.type({
    s3Url: t.string,
  }),
  t.partial({
    dstS3Url: t.string,
    width: t.number,
    height: t.number,
    format: t.union([t.literal('png'), t.literal('jpg')]),
  }),
])

export type Input = t.TypeOf<typeof InputPayload>

export const OutputPayload = InputPayload

export type Output = t.TypeOf<typeof OutputPayload>

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
  const payload = event.body !== undefined ? event.body : (event as any)
  return resize(decode<Input>(InputPayload, payload))
    .then(result => callback(null, result))
    .catch(err => {
      log.warn('Failed to resize image', err)
      throw toThrow(err, 'Failed to resize image')
    })
}

/** Invoked on S3 event */
export const s3EventHandler = (
  event: S3Event,
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
  return Promise.all(
    event.Records.filter(r => r.s3.object.key.endsWith('.jpg')).map(r =>
      resize(
        decode<Input>(InputPayload, {
          s3Url: 's3://' + r.s3.bucket.name + '/' + r.s3.object.key,
        }),
      ),
    ),
  ).then(result => callback(null, result))
}

export const resize = (input: Input): Promise<Output> => {
  const format = input.format || DEFAULT_FORMAT
  const width = input.width || DEFAULT_WIDTH
  const height = input.height || DEFAULT_HEIGHT
  const dstS3Url = input.dstS3Url || DEFAULT_DSTS3URL(input.s3Url)
  logger.info(`Resizing ${input.s3Url} to ${width}x${height}`)
  return s3
    .getObject({ Bucket: urlToBucketName(input.s3Url), Key: urlToKeyName(input.s3Url) })
    .promise()
    .then(data => {
      logger.info(`Got file ${data.Metadata}, ${data.ContentLength} bytes`)
      return Sharp(data.Body as Buffer) // FIXME: check types
        .resize(width, height)
        .toFormat(format)
        .toBuffer()
        .catch(err => {
          log.warn('Failed to resize image', err)
          throw toThrow(err, 'Failed to resize image')
        })
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
        })
        .promise()
        .catch(err => {
          log.warn('Failed to save resized image', err)
          throw toThrow(err, 'Failed to save resized image')
        })
        .then(result => {
          log.info('Saved to file ', result)
          return {
            ...input,
            format,
            dstS3Url,
            width,
            height,
          }
        })
    })
}
