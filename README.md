# AWS Resize

[![Sponsored](https://img.shields.io/badge/chilicorn-sponsored-brightgreen.svg)](http://spiceprogram.org/oss-sponsorship)

Resizes S3 stored image using NodeJS [sharp](https://github.com/lovell/sharp) library

  * Typescript
  * Unit and e2e tests
  * Configuration
  * Deployment using [Serverless framework](https://serverless.com)
  * Connect to API Gateway
  * Payload testing using [io-ts](https://github.com/gcanti/io-ts)

## Settings and private keys management

This project uses chamber CLI tool to manage project settings and private values. 
Uses AWS Parameter Store to read and populate environment with expected variables.
To read more about chamber, take a look at my article [Using AWS and segment.io/chamber CLI for managing secrets for your projects](https://medium.com/@ruslanfg/using-segment-io-chamber-for-managing-secrets-for-your-hobby-projects-2e08faaee5e2)

## Installing && running

  * Create bucket
  * `> yarn`
  * `> yarn lint && yarn format && yarn test && yarn build`
  * IMAGE_BUCKET=my-image-bucket yarn deploy
  * Invoke Lambda via url (provide payload for example `{ "s3Url": "s3://my-image-bucket/image.jpg" }`)
  * Invoke Lambda by saving .jpg file to S3 bucket
  * Check CloudWatch logs for processing journal
  * Check S3 bucket for .face.json cached rekognition results
  * To run e2e test run `TEST_RUN_E2E=1 E2E_IMAGE_URL=s3://my-image-bucket/img.jpg yarn test`

## Deploying on non-Linux OS

If you are building on MacOS, Windows or other OS, you need to build using Amazon Linux Docker images because sharp library uses binary library components. By default they are built for current OS and when deploying you will have a missing binary error.

## Links

  * https://docs.aws.amazon.com/rekognition/
