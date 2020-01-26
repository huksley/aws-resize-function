//import * as assert from 'assert'
//import { Input, InputPayload, resize } from '../src/resize'
import { resize } from '../src/resize'
//import { decode } from '../src/util'
import { config } from '../src/config'
import { logger as log } from '../src/logger'

describe('check types', () => {
  const e2e = config.TEST_E2E ? it : it.skip
  /*
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

  
  e2e('can resize sample', async function() {
    this.timeout(10000)
    const url = config.E2E_IMAGE_URL
    const res = resize({
      s3Url: url,
      faceRect: {
        left: 0.2866584062576294,
        top: 0.266741544008255,
        width: 0.34404903650283813,
        height: 0.31156522035598755,
      },
    })
    return res.then(result => log.info('result', result))
  })

  e2e('can resize sample without cache', async function() {
    this.timeout(10000)
    const url = config.E2E_IMAGE_URL
    const res = resize({
      s3Url: url,
      faceRect: {
        left: 0.2866584062576294,
        top: 0.266741544008255,
        width: 0.34404903650283813,
        height: 0.31156522035598755,
      },
      checkExists: false,
    })
    return res.then(result => log.info('result', result))
  })
  */

  e2e('can resize sample without cache', async function() {
    this.timeout(10000)
    const url =
      's3://find-face-bieghaid9a/profile/8b0bc476-0f05-4d8c-98e8-dde0ecb558c8-1580049627686.jpg'
    const res = resize({
      s3Url: url,
      faceRect: {
        left: 0.06484182924032211,
        top: 0.453233003616333,
        width: 0.3563779592514038,
        height: 0.3830893933773041,
      },
      checkExists: false,
    })
    return res.then(result => log.info('result', result))
  })
})
