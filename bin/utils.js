const fs = require('fs')
const path = require('path')
const colors = require('colors') // eslint-disable-line no-unused-vars
const inquirer = require('inquirer')
const appRoot = require('../src/utils.js').appRoot
const Web3 = require('web3')
const KEYSTORE_DIR = require('../src/constants.js').KEYSTORE_DIR

const web3 = new Web3()
const keystoreDirectory = path.join(appRoot.toString(), KEYSTORE_DIR)

async function getAccount () {
  if (!fs.existsSync(keystoreDirectory)) {
    fs.mkdirSync(keystoreDirectory)
  }
  const accounts = fs.readdirSync(keystoreDirectory)
  if (!accounts.length) {
    console.log('ERROR:'.red, 'No account found! Create a new account with `plasma-chain account new`')
    return
  }
  // Check if the account is plaintext
  let account = JSON.parse(fs.readFileSync(path.join(keystoreDirectory, accounts[0])))
  if (account.privateKey === undefined) {
    // Unlock account
    account = await _unlockAccount(account)
    if (account === null) {
      console.log('Max password attempts reached. Exiting!'.yellow)
      return null
    }
  }
  return account
}

async function _unlockAccount (encryptedAccount) {
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

module.exports = {
  getAccount
}
