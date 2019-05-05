import { S3 } from 'aws-sdk'
import * as t from 'io-ts'
const s3 = new S3({
  signatureVersion: 'v4',
})
import * as Sharp from 'sharp'
import { decode, urlToBucketName, urlToKeyName, toThrow } from './util'
import { Context as LambdaContext, APIGatewayEvent } from 'aws-lambda'
import { logger as log, logger } from './logger'

export const InputPayload = t.intersection([
  t.type({
    s3Url: t.string,
    dstS3Url: t.string,
    width: t.number,
    height: t.number,
  }),
  t.partial({
    format: t.union([t.literal('png'), t.literal('jpeg')]),
  }),
])

export type Input = t.TypeOf<typeof InputPayload>

/** Invoked on API Gateway call */
export const postHandler = (event: APIGatewayEvent, context: LambdaContext) =>
  resize(decode<Input>(InputPayload, event.body))
    .then(_ => context.done())
    .catch(err => {
      log.warn('Failed to resize', err)
      throw toThrow(err)
    })

export const resize = (input: Input) => {
  const format = input.format || 'png'
  logger.info(`Resizing ${input.s3Url} to ${input.width}x${input.height}`)
  return s3
    .getObject({ Bucket: urlToBucketName(input.s3Url), Key: urlToKeyName(input.s3Url) })
    .promise()
    .then(data => {
      logger.info(`Got file ${data.Metadata}, ${data.ContentLength} bytes`)
      return Sharp(data.Body as Buffer) // FIXME: check types
        .resize(input.width, input.height)
        .toFormat(format)
        .toBuffer()
    })
    .then(buffer => {
      logger.info(`Writing resize image to ${input.dstS3Url}, ${buffer.length} bytes`)
      s3.putObject({
        Body: buffer,
        Bucket: urlToBucketName(input.dstS3Url),
        ContentType: format === 'jpeg' ? 'image/jpeg' : 'image/' + format,
        Key: urlToKeyName(input.dstS3Url),
      }).promise()
    })
}
