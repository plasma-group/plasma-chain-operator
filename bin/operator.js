#!/usr/bin/env node
const program = require('commander')
const appRoot = require('app-root-path')

program
  .version('0.0.1')
  .command('start', 'start the operator')
  .command('account [cmd]', 'manage accounts')
  .action((command) => {
    // console.log('App root:', appRoot.toString(), command)
  })
  .parse(process.argv)
