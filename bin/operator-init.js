#!/usr/bin/env node
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars
const getAccount = require('./utils.js').getAccount
// const server = require(appRoot + '/src/server.js')
// const readConfigFile = require(appRoot + '/src/utils.js').readConfigFile

program
  .command('*')
  .description('starts the operator using the first account')
  .option('-n, --new-network', 'Initialize a new Plasma Network in addition to a Plasma Chain')
  .action(async (none, cmd) => {
    const account = await getAccount()
    if (account === null) {
      return
    }
    // Initialize a new Plasma Chain
    console.log('Initializing chain!')
  })

program.parse(process.argv)
