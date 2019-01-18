#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars
const inquirer = require('inquirer')
const appRoot = require('app-root-path')
const Web3 = require('web3')
const server = require(appRoot + '/src/server.js')
const readConfigFile = require(appRoot + '/src/utils.js').readConfigFile

const web3 = new Web3()
const keystoreDirectory = path.join(appRoot.toString(), 'keystore')

program
  .command('*')
  .description('starts the operator using the first account')
  .action(async (none, cmd) => {
    if (!fs.existsSync(keystoreDirectory)) {
      fs.mkdirSync(keystoreDirectory)
    }
    const accounts = fs.readdirSync(keystoreDirectory)
    if (!accounts.length) {
      console.log('No account found! Create a new account with `operator account new`')
      return
    }
    // Check if the account is plaintext
    let account = JSON.parse(fs.readFileSync(path.join(keystoreDirectory, accounts[0])))
    if (account.privateKey === undefined) {
      // Unlock account
      account = await unlockAccount(account)
      if (account === null) {
        console.log('Max password attempts reached. Exiting!'.yellow)
        return
      }
    }
    // Start the server!
    const configFile = (process.env.CONFIG) ? process.env.CONFIG : path.join(appRoot.toString(), 'config.json')
    const config = readConfigFile(configFile)
    config.privateKey = account.privateKey
    await server.startup(config)
  })

async function unlockAccount (encryptedAccount) {
  let account
  for (let i = 0; i < 3; i++) {
    const response = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Passphrase:'
    }])
    try {
      account = web3.eth.accounts.wallet.decrypt([encryptedAccount], response.password)['0']
    } catch (err) {
      account = null
      console.log('Wrong password'.red, 'Please try again', '<3'.red)
    }
    if (account !== null) {
      return account
    }
  }
  return account
}

program.parse(process.argv)
