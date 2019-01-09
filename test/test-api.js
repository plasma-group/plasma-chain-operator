/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const app = require('../src/app')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('../src/eth.js').utils.BN
const log = require('debug')('test:info:test-api')

const expect = chai.expect

chai.use(chaiHttp)

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
      for (let i = 0; i < 1000; i++) {
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
        done()
      })
    })
  })
})
