#!/usr/bin/env node
const path = require('path')
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars
const getAccount = require('./utils.js').getAccount
const appRoot = require('app-root-path')
const ethService = require(appRoot + '/src/eth-service.js')
const readConfigFile = require(appRoot + '/src/utils.js').readConfigFile

program
  .description('starts the operator using the first account')
  .option('-n, --newRegistry', 'Initialize a new Plasma Network in addition to a Plasma Chain')
  .action(async (none, cmd) => {
    const account = await getAccount()
    if (account === null) {
      return
    }
    // Initialize a new Plasma Chain
    const configFile = (process.env.CONFIG) ? process.env.CONFIG : path.join(appRoot.toString(), 'config.json')
    const config = readConfigFile(configFile)
    config.privateKey = account.privateKey
    if (cmd.newRegistry === true) {
      config.plasmaRegistryAddress = 'DEPLOY'
    }
    await ethService.startup(config)
  })

program.parse(process.argv)
