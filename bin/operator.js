#!/usr/bin/env node
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars

program
  .version('0.0.1')
  .description('Welcome to the Plasma Operator!'.rainbow)
  .command('init', 'initalize a new plasma chain')
  .command('start', 'start the operator')
  .command('account [cmd]', 'manage accounts')
  .action((command) => {
  })
  .parse(process.argv)
