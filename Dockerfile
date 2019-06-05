# Chamber image
FROM segment/chamber:2 AS chamber

# Build container
FROM node:8.11.0-alpine
RUN apk --update add bash curl git
ENV TZ UTC
WORKDIR /app

# Install required yarn version
RUN curl -o- -L https://yarnpkg.com/install.sh | bash -s -- --version 1.12.3
ENV PATH="/root/.yarn/bin:/root/.config/yarn/global/node_modules/.bin:${PATH}"

COPY package.json package.json
COPY yarn.lock yarn.lock
# Install dependencies only first
RUN yarn install
COPY . .
COPY --from=chamber /chamber /bin/chamber
CMD [ "yarn" ]
