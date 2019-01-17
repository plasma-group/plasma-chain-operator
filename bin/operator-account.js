#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars
const inquirer = require('inquirer')
const appRoot = require('app-root-path')
const Web3 = require('web3')

const web3 = new Web3()
const keystoreDirectory = path.join(appRoot.toString(), 'keystore')

program
  .command('new')
  .description('creates a new account')
  .option('-p, --plaintext', 'Store the private key in plaintext')
  .action(async (none, cmd) => {
    const newAccount = await createAccount(cmd.plaintext)
    if (newAccount === undefined) {
      return
    }
    console.log('Created new account with address:', newAccount.address.green)
    const keystorePath = path.join(keystoreDirectory, new Date().toISOString() + '--' + newAccount.address)
    console.log('Saving encrypted account to:', keystorePath.yellow)
    fs.writeFileSync(keystorePath, newAccount.keystoreFile)
    // Create new password file
  })

program
  .command('list')
  .description('list all accounts')
  .action((none, cmd) => {
    let counter = 0
    fs.readdirSync(keystoreDirectory).forEach(file => {
      if (file === '.gitignore') {
        return
      }
      console.log('Account #' + counter++ + ':', file.split('--')[1])
    })
  })

async function createAccount (isPlaintext) {
  if (isPlaintext) {
    const newAccount = web3.eth.accounts.create()
    return {
      address: newAccount.address,
      keystoreFile: JSON.stringify(newAccount)
    }
  }
  // If it's not plaintext, we need to prompt for password
  console.log('Your new account is locked with a password. Please give a password. Do not forget this password.')
  const response = await inquirer.prompt([{
    type: 'password',
    name: 'password',
    message: 'Passphrase:'
  },
  {
    type: 'password',
    name: 'retypePassword',
    message: 'Repeat passphrase:'
  }])
  if (response.password !== response.retypePassword) {
    console.log('Passwords do not match! Try again...'.red)
    return
  }
  const newAccount = web3.eth.accounts.create()
  const encryptedAccount = newAccount.encrypt(response.password)
  return {
    address: newAccount.address,
    keystoreFile: JSON.stringify(encryptedAccount)
  }
}

program.parse(process.argv)

if (program.args.length === 1) {
  console.log('Command not found. Try `' + 'operator help account'.yellow + '` for more options')
}
