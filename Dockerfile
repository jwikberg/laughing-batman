FROM dockerfile/nodejs

RUN npm install -g pm2

ADD package.json /app/package.json

RUN cd /app && npm install --production

ADD . /app

WORKDIR /app

CMD pm2 start --name app /app/src/index.js && pm2 logs app
