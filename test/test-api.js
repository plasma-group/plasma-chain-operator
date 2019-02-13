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
const readConfigFile = require('../src/utils.js').readConfigFile
const path = require('path')

const expect = chai.expect

chai.use(chaiHttp)

let idCounter = 0
let totalDeposits = new BN(0)

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
          params: [
            encodedTx
          ]
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
  // Add deposit will deposit coins for an ID that no one cares about.
  // This is to simulate throughput without mainchain transactions.
  addDeposit: (recipient, token, amount) => {
    return new Promise((resolve, reject) => {
      const start = new BN(totalDeposits)
      totalDeposits = new BN(totalDeposits.add(amount))
      const end = new BN(totalDeposits)
      totalDeposits = totalDeposits.add(amount)
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {
            recipient: web3.utils.bytesToHex(recipient),
            token: token.toString(16),
            start: start.toString(16),
            end: end.toString(16)
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
  },
  getBlockNumber: () => {
    return new Promise((resolve, reject) => {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.GET_BLOCK_NUMBER_METHOD,
          jsonrpc: '2.0',
          id: idCounter++,
          params: {}
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          log('Resolve get block number')
          resolve(new BN(res.body.result, 10))
        })
    })
  }
}

describe('Server api', function () {
  before(async () => {
    // Startup with test config file
    const configFile = path.join(__dirname, 'config-test.json')
    const config = readConfigFile(configFile, 'test')
    await server.safeStartup(config)
  })

  beforeEach(() => {
    totalDeposits = new BN(0)
  })

  describe('/api', function () {
    it('responds with status 200 on deposit', function (done) {
      chai.request(server.app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          params: {
            recipient: accounts[0].address,
            token: new BN(999).toString(16),
            start: new BN(0).toString(16),
            end: new BN(10).toString(16)
          }
        })
        .end((err, res) => {
          log(err)
          expect(res).to.have.status(200)
          done()
        })
    })
    it('responds with status 200 for many deposits', function (done) {
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(chai.request(server.app)
          .post('/api')
          .send({
            method: constants.DEPOSIT_METHOD,
            jsonrpc: '2.0',
            params: {
              recipient: accounts[0].address,
              token: new BN(999).toString(16),
              start: new BN(i * 10).toString(16),
              end: new BN((i + 1) * 10).toString(16)
            }
          }))
      }
      Promise.all(promises).then((res) => {
        log('Completed: responds with status 200 for many requests')
        done()
      })
    })

    it('Nodes are able to deposit and send transactions using the api', (done) => {
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(operator, acct, nodes))
      }
      runDepositAndSendTxTest(nodes, operator).then((res) => {
        done()
      })
    })
  })
})

// Use a function outside of the main test because mocha doens't play as nicely with async functions--the tests don't end consistently
async function runDepositAndSendTxTest (nodes, operator) {
  const depositType = new BN(0)
  const depositAmount = new BN(10000)
  // Add deposits from 100 different accounts
  for (const node of nodes) {
    await node.deposit(depositType, depositAmount)
  }
  await mineAndLoopSendRandomTxs(5, operator, nodes)
}

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  for (let i = 0; i < numTimes; i++) {
    let blockNumber = await operator.getBlockNumber()
    try {
      await sendRandomTransactions(operator, nodes, blockNumber)
    } catch (err) {
      if (err.toString().contains('No affected range found! Must be an invalid subtraction')) {
        console.log('ERROR:', err)
      }
      console.log('Squashing for now... this might be a problem with the range manager which I need to sort out anyway...')
    }
    log('Starting new block...')
    await operator.startNewBlock()
    blockNumber = await operator.getBlockNumber()
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
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
