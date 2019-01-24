/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const server = require('../src/server')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('web3').utils.BN
const log = require('debug')('test:info:test-integration')
const MockNode = require('../src/mock-node.js')
const EthService = require('../src/eth-service.js')
const appRoot = require('app-root-path')
const readConfigFile = require('../src/utils.js').readConfigFile
const path = require('path')
const UnsignedTransaction = require('plasma-utils').serialization.models.UnsignedTransaction
const DEPOSIT_SENDER = '0x0000000000000000000000000000000000000000'

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

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
  addDeposit: async (recipient, type, amount) => {
    // Construct deposit transaction
    // TODO: change this to actually use the right type and amount
    const reciept = await EthService.plasmaChain.methods.submitDeposit().send({
      from: EthService.web3.utils.bytesToHex(recipient),
      value: new BN('100000000', 'hex').toString(),
      gas: 3500000,
      gasPrice: '300000'
    })
    const depositEvent = reciept.events.DepositEvent.returnValues
    const tokenType = new BN(depositEvent.start).toArrayLike(Buffer, 'big', 16).slice(0, 4)
    const start = new BN(depositEvent.start).toArrayLike(Buffer, 'big', 16).slice(4)
    const end = new BN(depositEvent.end).toArrayLike(Buffer, 'big', 16).slice(4)
    const deposit = new UnsignedTransaction({block: depositEvent.block, transfers: [{sender: DEPOSIT_SENDER, recipient: depositEvent.depositer, tokenType, start, end}]})
    return deposit
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

describe.only('Server', function () {
  before(async () => {
    // Startup with test config file
    const configFile = path.join(appRoot.toString(), 'test', 'config-test.json')
    const config = readConfigFile(configFile, 'test')
    await server.safeStartup(config)
  })
  it('Nodes are able to deposit and send transactions', (done) => {
    // const accts = accounts.slice(0, 5)
    const nodes = []
    // for (const acct of accts) {
    for (const acct of accounts) {
      nodes.push(new MockNode(operator, acct, nodes))
    }
    bigIntegrationTest(nodes, operator).then(() => {
      done()
    })
  })
})

async function bigIntegrationTest (nodes, operator) {
  // Add deposits from 100 different accounts
  const depositType = new BN(0)
  const depositAmount = new BN(10000, 'hex')
  for (const node of nodes) {
    await node.deposit(depositType, depositAmount)
    log('Submitted deposit')
  }
  // Now mine and send random transactions
  await mineAndLoopSendRandomTxs(5, operator, nodes)
}

async function mineAndLoopSendRandomTxs (numTimes, operator, nodes) {
  await operator.startNewBlock()
  for (let i = 0; i < numTimes; i++) {
    log('Starting new block...')
    const blockNumberResponse = await operator.startNewBlock()
    const blockNumber = new BN(blockNumberResponse.newBlockNumber)
    log('Waiting before starting block:', blockNumber.toString() + '...')
    await timeout(500)
    log('Sending new txs for block number:', blockNumber.toString())
    for (const node of nodes) {
      node.processPendingRanges()
    }
    // await sendRandomTransactions(operator, nodes, blockNumber)
    for (const node of nodes) {
      await node.sendRandomTransaction(blockNumber, 1024)
    }
  }
}
