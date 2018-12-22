/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const app = require('../app')
const testTx = require('./mock-transactions.js')

const expect = chai.expect

chai.use(chaiHttp)

describe('App', function () {
  describe('/add-transaction', function () {
    it('responds with status 200', function (done) {
      chai.request(app)
        .post('/add-transaction')
        .send(testTx)
        .end((err, res) => {
          console.log(err)
          expect(res).to.have.status(200)
          done()
        })
    })
  })
})
