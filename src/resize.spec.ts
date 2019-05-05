import * as assert from 'assert'
import { Input, InputPayload, resize } from './resize'
import { decode, noext, ext } from './util'
import { config } from './config'
import { logger as log } from './logger'

describe('check types', () => {
  it('input payload parseable', () => {
    decode<Input>(InputPayload, {
      s3Url: 's3://bucket-name/key-name.jpg',
      dstS3Url: 's3://bucket-name/key-name-thumbnail.jpg',
      width: 600,
      height: 600,
    })
  })

  it('input payload string parseable', () => {
    decode<Input>(
      InputPayload,
      JSON.stringify({
        s3Url: 's3://bucket-name/key-name.jpg',
        dstS3Url: 's3://bucket-name/key-name-thumbnail.jpg',
        width: 600,
        height: 600,
      }),
    )
  })

  it('input payload fail on errors', () => {
    try {
      decode<Input>(InputPayload, {})
    } catch (err) {
      assert.ok(err)
      log.info('Expected exception: ' + err.message)
    }
  })

  const e2e = config.TEST_E2E ? it : it.skip
  e2e('can resize sample', async function() {
    this.timeout(10000)
    const url = config.E2E_IMAGE_URL
    const res = resize({
      s3Url: url,
      dstS3Url: noext(url) + '-thumbnail' + '.' + ext(url),
      width: 600,
      height: 600,
      format: 'png',
    })
    return res.then(result => log.info('result', result))
  })
})
