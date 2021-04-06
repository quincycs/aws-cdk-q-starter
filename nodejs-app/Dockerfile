FROM node:14
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# If you are building your code for development
# RUN npm install

# If you are building your code for production
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=3s --retries=3 \
      CMD curl -f https://localhost:8080 || exit 1

CMD [ "node", "server.js" ]