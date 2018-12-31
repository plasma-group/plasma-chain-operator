/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const State = require('../src/state-manager/state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const accounts = require('./mock-accounts.js').accounts
const BN = require('../src/eth.js').utils.BN
const MockNode = require('../src/mock-node.js')
const log = require('debug')('test:info:test-mock-node')
// const expect = chai.expect

chai.use(chaiHttp)

describe('MockNode', function () {
  let db
  let state
  const startNewDB = async () => {
    db = levelup(leveldown('./test-db/' + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = './test-db/' + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State.State(db, txLogDirectory, () => true)
    await state.init()
  }
  beforeEach(startNewDB)

  describe('addDeposit', () => {
    it('should work with sequential txs', async () => {
      const depositType = new BN(1)
      const depositAmount = new BN(10)
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(state, acct, nodes))
      }
      // Add deposits from 100 different accounts
      for (const node of nodes) {
        await node.deposit(depositType, depositAmount)
      }
      // For 10 blocks, have every node send a random transaction
      for (let i = 0; i < 10; i++) {
        await state.startNewBlock()
        for (const node of nodes) {
          node.processPendingRanges()
        }
        for (const node of nodes) {
          await node.sendRandomTransaction()
        }
      }
    })
    it('should work with many small blocks', (done) => {
      const depositType = new BN(1)
      const depositAmount = new BN(10000000)
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(state, acct, nodes))
      }
      // Add deposits from 100 different accounts
      const depositPromises = []
      for (const node of nodes) {
        depositPromises.push(node.deposit(depositType, depositAmount))
      }
      Promise.all(depositPromises).then((res) => {
        // For 10 blocks, have every node send a random transaction
        mineAndLoopSendRandomTxs(10, state, nodes).then(() => {
          done()
        })
      })
    })
    it('should work with one massive block', (done) => {
      const depositType = new BN(1)
      const depositAmount = new BN(10000000)
      const nodes = []
      for (const acct of accounts) {
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
        // For 10 blocks, have every node send a random transaction
        loopSendRandomTxs(10, state, nodes).then(() => {
          done()
        })
      })
    })
  })
})

async function loopSendRandomTxs (numTimes, state, nodes) {
  await state.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    log('Sending new set of transactions!')
    await sendRandomTransactions(nodes, 10)
  }
  await state.startNewBlock()
}

async function mineAndLoopSendRandomTxs (numTimes, state, nodes) {
  for (let i = 0; i < numTimes; i++) {
    await state.startNewBlock()
    for (const node of nodes) {
      node.processPendingRanges()
    }
    await sendRandomTransactions(nodes)
  }
}

function sendRandomTransactions (nodes, maxSize) {
  const promises = []
  for (const node of nodes) {
    promises.push(node.sendRandomTransaction(maxSize))
  }
  return Promise.all(promises)
}
