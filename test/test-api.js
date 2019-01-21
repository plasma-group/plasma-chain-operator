/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const server = require('../src/server')
const web3 = require('web3')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('web3').utils.BN
const log = require('debug')('test:info:test-api')
const MockNode = require('../src/mock-node.js')
const appRoot = require('app-root-path')
const readConfigFile = require('../src/utils.js').readConfigFile
const path = require('path')

const expect = chai.expect

chai.use(chaiHttp)

let idCounter = 0

// Operator object wrapper to query api
const operator = {
  addTransaction: (tx) => {
    const encodedTx = tx.encoded
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.ADD_TX_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {
            encodedTx
          }
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve add tx')
          // Parse the response to return what the mock node expects
          const txResponse = res.body
          // Return the deposit
          resolve(txResponse)
        })
    })
  },
  addDeposit: (recipient, token, amount) => {
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {
            recipient: web3.utils.bytesToHex(recipient),
            token: token.toString(16),
            amount: amount.toString(16)
          }
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          // Return the deposit
          resolve(res.body.deposit)
        })
    })
  },
  startNewBlock: () => {
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.NEW_BLOCK_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {}
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve new block')
          resolve(res.body)
        })
    })
  }
}

describe('Server', function () {
  before(async () => {
    // Startup with test config file
    const configFile = path.join(appRoot.toString(), 'test', 'config-test.json')
    const config = readConfigFile(configFile, 'test')
    await server.safeStartup(config)
  })

  describe('/api', function () {
    it('responds with status 200', function (done) {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          params: {
            recipient: accounts[0].address,
            token: new BN(0).toString(16),
            amount: new BN(10).toString(16)
          }
        })
        .end((err, res) => {
          log(err)
          expect(res).to.have.status(200)
          done()
        })
    })
    it('responds with status 200 for many requests', function (done) {
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(chai.request(server.app)
          .post('/api')
          .send({
            method: constants.DEPOSIT_METHOD,
            jsonrpc: '2.0',
            params: {
              recipient: accounts[0].address,
              token: new BN(0).toString(16),
              amount: new BN(10).toString(16)
            }
          }))
      }
      Promise.all(promises).then((res) => {
        log('Completed: responds with status 200 for many requests')
        done()
      })
    })

    it('Nodes are able to deposit and send transactions', (done) => {
      const depositType = new BN(1)
      const depositAmount = new BN(10000)
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
        mineAndLoopSendRandomTxs(5, operator, nodes).then(() => {
          done()
        })
      })
    })
  })
})

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  await operator.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    log('Starting new block...')
    const blockNumberResponse = await operator.startNewBlock()
    const blockNumber = new BN(blockNumberResponse.newBlockNumber)
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
    await sendRandomTransactions(operator, nodes, blockNumber)
  }
}

let randomTxPromises
let promisesAndTestIds = []

function sendRandomTransactions (operator, nodes, blockNumber, rounds, maxSize) {
  if (rounds === undefined) rounds = 1
  randomTxPromises = []
  for (let i = 0; i < rounds; i++) {
    for (const node of nodes) {
      randomTxPromises.push(node.sendRandomTransaction(blockNumber, maxSize))
      promisesAndTestIds.push({
        promise: randomTxPromises[randomTxPromises.length - 1],
        id: idCounter
      })
    }
  }
  Promise.all(randomTxPromises).then(() => { promisesAndTestIds = [] })
  return Promise.all(randomTxPromises)
}
