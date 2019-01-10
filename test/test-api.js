/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const app = require('../src/app')
const web3 = require('web3')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('../src/eth.js').utils.BN
const log = require('debug')('test:info:test-api')
const MockNode = require('../src/mock-node.js')

const expect = chai.expect

chai.use(chaiHttp)

// Operator object wrapper to query api
const operator = {
  addTransaction: (tx) => {
    const encodedTx = tx.encode()
    return new Promise((resolve, reject) => {
      chai.request(app)
        .post('/api')
        .send({
          method: constants.ADD_TX_METHOD,
          jsonrpc: '2.0',
          params: {
            encodedTx
          }
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          // Parse the response to return what the mock node expects
          const txResponse = res.body
          // Return the deposit
          resolve(txResponse)
        })
    })
  },
  addDeposit: (recipient, type, amount) => {
    return new Promise((resolve, reject) => {
      chai.request(app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          params: {
            recipient: web3.utils.bytesToHex(recipient),
            type: type.toString(16),
            amount: amount.toString(16)
          }
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          // Parse the response to return what the mock node expects
          const deposit = res.body
          deposit.type = new BN(deposit.type, 'hex')
          deposit.start = new BN(deposit.start, 'hex')
          deposit.end = new BN(deposit.end, 'hex')
          // Return the deposit
          resolve(deposit)
        })
    })
  },
  startNewBlock: () => {
    return new Promise((resolve, reject) => {
      chai.request(app)
        .post('/api')
        .send({
          method: constants.NEW_BLOCK_METHOD,
          jsonrpc: '2.0',
          params: {}
        })
        .end((err, res) => {
          if (err) {
            throw err
          }
          resolve(res.body)
        })
    })
  }
}

describe('App', function () {
  describe('/api', function () {
    it('responds with status 200', function (done) {
      chai.request(app)
        .post('/api')
        .send({
          method: constants.DEPOSIT_METHOD,
          jsonrpc: '2.0',
          params: {
            recipient: accounts[0].address,
            type: new BN(0).toString(16),
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
        promises.push(chai.request(app)
          .post('/api')
          .send({
            method: constants.DEPOSIT_METHOD,
            jsonrpc: '2.0',
            params: {
              recipient: accounts[0].address,
              type: new BN(0).toString(16),
              amount: new BN(10).toString(16)
            }
          }))
      }
      Promise.all(promises).then((res) => {
        log('Completed: responds with status 200 for many requests')
        done()
      })
    })

    it('Nodes are able to deposit', (done) => {
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
        // Start a new block
        log('Finished nodes depositing over http!')
        operator.startNewBlock().then((res) => {
          const blockNumber = res.newBlockNumber
          log('Started new block', res)
          // Now send some transactions
          const txPromises = []
          for (let i = 0; i < 3; i++) {
            for (const node of nodes) {
              txPromises.push(node.sendRandomTransaction(new BN(blockNumber)))
            }
          }
          Promise.all(txPromises).then((res) => {
            log('Transaction sent!')
            done()
          })
        })
      })
    })
  })
})
