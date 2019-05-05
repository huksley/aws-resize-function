import * as assert from 'assert'
import { logger as log } from './logger'
import * as t from 'io-ts'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { URL } from 'url'
import * as R from 'ramda'

export const urlToBucketName = (s3Url: string): string => {
  const u = new URL(s3Url)
  if (u.protocol === 's3:') {
    return u.host
  } else if (u.protocol === 'https:') {
    // Host is region.awshost, path starts with bucket
    const p = u.pathname.substring(1).split('/')
    assert.ok(p && p.length > 0)
    return p[0]
  } else {
    throw new Error('Unsupported protocol: ' + s3Url)
  }
}

export const urlToKeyName = (s3Url: string): string => {
  const u = new URL(s3Url)
  if (u.protocol === 's3:') {
    return u.pathname.substring(1)
  } else if (u.protocol === 'https:') {
    // Host is region.awshost, path starts with bucket
    const p = u.pathname.substring(1).split('/')
    assert.ok(p && p.length > 0)
    p.splice(0, 1)
    return p.join('/')
  } else {
    throw new Error('Unsupported protocol: ' + s3Url)
  }
}

/** Assert something and pass something */
export const passert = <T>(value: any | undefined | null, result: T | null | undefined): T => {
  assert.ok(value)
  return result as NonNullable<T>
}

/** Log something and pass something */
export const plog = <T>(msg: string, meta: any | undefined, result: T): T => {
  log.info(msg, JSON.stringify(meta))
  return result
}

/** Decode or throw exception */
export const decode = <T>(
  type: t.TypeC<any> | t.IntersectionC<any> | t.PartialC<any>,
  json: string | undefined | null | any,
) => {
  assert.ok(json)
  const res = type.decode(typeof json === 'string' ? JSON.parse(json!) : json)
  const value = res.getOrElseL(_ => {
    throw new Error('Invalid value ' + JSON.stringify(PathReporter.report(res)))
  })
  // Filter undefined
  return R.pick(R.filter(k => value[k] !== undefined, R.keys(value)) as string[], value) as T
}

export const toThrow = (err: any, msg?: string) =>
  new Error(err && err && err.message && err.message + (msg && '' + msg))

export const noext = (path: string) => {
  return path.substring(0, path.lastIndexOf('.'))
}

export const ext = (path: string) => {
  return path.substring(path.lastIndexOf('.') + 1)
}
