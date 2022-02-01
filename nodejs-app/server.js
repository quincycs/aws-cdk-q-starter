'use strict';

const express = require('express');
const DynamoDB = require('aws-sdk/clients/dynamodb');

/*
 * Environment variables usages
 */
const REGION = process.env.AWS_DEFAULT_REGION;
const dbTable = process.env.dbTableName;

const db = new DynamoDB({
  apiVersion: '2012-08-10',
  region: REGION
});
const app = express();

app.get('/', (req, res) => {
  console.log('hi!');
  const params = {
    Key: {
      id: {
        S: "hello world"
      }
    },
    TableName: dbTable
  };
  db.getItem(params, (err, data) => {
    if (err) {
      console.log(err);
      res.send('ERROR: ' + err);
    }
    else {
      console.log(data);
      res.send('SUCCESS blue v3! : ' + JSON.stringify(data));
    }
  });
});

app.listen(8080, () => {
  console.log(`Listening on 8080`);
});
