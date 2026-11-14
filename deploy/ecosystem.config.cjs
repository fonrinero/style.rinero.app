'use strict';

const path = require('node:path');
const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'style-api',
      cwd: root,
      script: 'npm',
      args: ['run', 'start', '--workspace', '@style/server'],
      interpreter: 'none',
      env: { NODE_ENV: 'production', PORT: '3200' },
      autorestart: true,
      max_restarts: 10,
      time: true
    },
    {
      name: 'style-customer-web',
      cwd: root,
      script: 'npm',
      args: ['run', 'start', '--workspace', '@style/customer-web'],
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        STYLE_API_BASE_URL: 'http://127.0.0.1:3200'
      },
      autorestart: true,
      max_restarts: 10,
      time: true
    },
    {
      name: 'style-business-portal',
      cwd: root,
      script: 'npm',
      args: ['run', 'start', '--workspace', '@style/business-portal'],
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      time: true
    }
  ]
};
