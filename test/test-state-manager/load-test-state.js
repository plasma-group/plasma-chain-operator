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

const expect = chai.expect // eslint-disable-line no-unused-vars

let state

const operator = {
  addDeposit: (address, tokenType, amount) => {
    return state.addDeposit(address, tokenType, amount)
  },
  addTransaction: (tx) => {
    return state.addTransaction(tx)
  }
}

describe('State', function () {
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
    it('accepts many deposits from the mock node swarm', (done) => {
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
        mineAndLoopSendRandomTxs(100, operator, nodes).then(() => { // 10000
          done()
        })
      })
    })

    it('should work with one massive block', (done) => {
      // const accts = accounts.slice(0, 2)
      const depositType = new BN(1)
      const depositAmount = new BN('1000000')
      const nodes = []
      for (const acct of accounts) {
      // for (const acct of accts) {
        nodes.push(new MockNode(state, acct, nodes))
      }
      // Add deposits from 100 different accounts
      const depositPromises = []
      for (const node of nodes) {
        depositPromises.push(node.deposit(depositType, depositAmount))
      }
      Promise.all(depositPromises).catch((err) => {
        console.log(err)
      }).then((res) => {
        // For some number of rounds, have every node send a random transaction
        loopSendRandomTxs(100, operator, nodes).then(() => {
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

async function loopSendRandomTxs (numTimes, operator, nodes) {
  const blockNumber = await state.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    await sendRandomTransactions(operator, nodes, blockNumber, 1, 10)
  }
  await state.startNewBlock()
}

function sendRandomTransactions (operator, nodes, blockNumber, rounds, maxSize) {
  if (rounds === undefined) rounds = 1
  const randomTxPromises = []
  for (let i = 0; i < rounds; i++) {
    for (const node of nodes) {
      randomTxPromises.push(node.sendRandomTransaction(blockNumber, maxSize))
    }
    log('Starting round:', i)
  }
  // log('promises:', randomTxPromises)
  return Promise.all(randomTxPromises)
}
