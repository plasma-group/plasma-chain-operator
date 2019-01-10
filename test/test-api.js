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
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

chai.use(chaiHttp)

// Operator object wrapper to query api
const operator = {
  addTransaction: (tx) => {
    // TODO
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
          deposit.type = new BN(deposit.type)
          deposit.start = new BN(deposit.start)
          deposit.end = new BN(deposit.end)
          // Return the deposit
          resolve(deposit)
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
      const depositAmount = new BN(10)
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(operator, acct, nodes))
      }
      const promises = []
      // Add deposits from 100 different accounts
      for (const node of nodes) {
        promises.push(node.deposit(depositType, depositAmount))
      }
      Promise.all(promises).then((res) => {
        log('Finished nodes depositing over http!')
        done()
      })
    })
  })
})
