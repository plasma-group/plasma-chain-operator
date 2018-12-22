/* eslint-env mocha */

var chai = require('chai')
var chaiHttp = require('chai-http')
var app = require('../app')

var expect = chai.expect

chai.use(chaiHttp)

describe('App', function () {
  describe('/add-transaction', function () {
    it('responds with status 200', function (done) {
      chai.request(app)
        .post('/add-transaction')
        .send({
          '_method': 'put',
          'password': '123',
          'confirmPassword': '123'
        })
        .end((err, res) => {
          console.log(err)
          expect(res).to.have.status(200)
          done()
        })
    })
  })
})
