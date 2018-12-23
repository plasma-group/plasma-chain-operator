/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const app = require('../app')
const constants = require('../constants.js')
const accounts = require('./mock-accounts.js').accounts
const BN = require('../eth.js').utils.BN

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
          console.log(err)
          expect(res).to.have.status(200)
          done()
        })
    })
  })
})
