/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const accounts = require('../mock-accounts.js').accounts
const web3 = require('web3')
const BN = web3.utils.BN
const State = require('../../src/state-manager/state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const log = require('debug')('test:info:load-test-state')
const MockNode = require('../../src/mock-node.js')
const models = require('plasma-utils').serialization.models
const SignedTransaction = models.SignedTransaction
const UnsignedTransaction = models.UnsignedTransaction

const expect = chai.expect // eslint-disable-line no-unused-vars

let state

const operator = {
  addDeposit: (address, tokenType, amount) => {
    return state.addDeposit(address, tokenType, amount)
  },
  addTransaction: (tx) => {
    state.addTransaction(tx)
  }
}

describe.only('State', function () {
  let db
  const startNewDB = async () => {
    const dbDir = './db-test/'
    if (!fs.existsSync(dbDir)) {
      log('Creating a new db directory because it does not exist')
      fs.mkdirSync(dbDir)
    }
    db = levelup(leveldown(dbDir + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = dbDir + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State.State(db, txLogDirectory, () => true)
    await state.init()
  }
  beforeEach(startNewDB)

  describe('Mock node swarm', () => {
    it.only('accepts many deposits from the mock node swarm', (done) => {
      // const accts = accounts.slice(0, 2)
      const depositType = new BN(0)
      const depositAmount = new BN(256)
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(operator, acct, nodes))
      }
      const depositPromises = []
      // Add deposits from 100 different accounts
      for (const node of nodes) {
        depositPromises.push(node.deposit(depositType, depositAmount))
      }
      Promise.all(depositPromises).then((res) => {
        // Send txs!
        mineAndLoopSendRandomTxs(10000, operator, nodes).then(() => { // 10000
          done()
        })
      })
    })
  })
})

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  await state.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    log('Starting new block...')
    const blockNumber = await state.startNewBlock()
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
    await sendRandomTransactions(operator, nodes, blockNumber)
  }
}

let randomTxPromises

function sendRandomTransactions (operator, nodes, blockNumber, rounds, maxSize) {
  if (rounds === undefined) rounds = 1
  randomTxPromises = []
  for (let i = 0; i < rounds; i++) {
    for (const node of nodes) {
      randomTxPromises.push(node.sendRandomTransaction(blockNumber, maxSize))
    }
  }
  return Promise.all(randomTxPromises)
}
