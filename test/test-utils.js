/* eslint-env mocha */

const chai = require('chai')
const expect = chai.expect
const utils = require('../src/utils.js')
const BN = require('web3').utils.BN

function bn (number) {
  return new BN(number)
}

describe('utils', function () {
  describe('addRange', () => {
    it('adds ranges and merges if possible', async () => {
      const addRange = utils.addRange
      const rangeList = [bn(0), bn(2), bn(6), bn(11), bn(15), bn(18), bn(20), bn(21)]
      addRange(rangeList, bn(5), bn(6))
      expect(rangeList).to.deep.equal([bn(0), bn(2), bn(5), bn(11), bn(15), bn(18), bn(20), bn(21)])
      addRange(rangeList, bn(3), bn(4))
      expect(rangeList).to.deep.equal([bn(0), bn(2), bn(3), bn(4), bn(5), bn(11), bn(15), bn(18), bn(20), bn(21)])
      addRange(rangeList, bn(2), bn(3))
      expect(rangeList).to.deep.equal([bn(0), bn(4), bn(5), bn(11), bn(15), bn(18), bn(20), bn(21)])
      addRange(rangeList, bn(4), bn(5))
      expect(rangeList).to.deep.equal([bn(0), bn(11), bn(15), bn(18), bn(20), bn(21)])
      addRange(rangeList, bn(18), bn(20))
      expect(rangeList).to.deep.equal([bn(0), bn(11), bn(15), bn(21)])
      addRange(rangeList, bn(11), bn(15))
      expect(rangeList).to.deep.equal([bn(0), bn(21)])
    })
  })

  describe('subtractRange', () => {
    it('removes ranges & splits them up if needed', async () => {
      const subtractRange = utils.subtractRange
      const rangeList = [bn(0), bn(4), bn(6), bn(11), bn(15), bn(18), bn(18), bn(19)]
      subtractRange(rangeList, bn(0), bn(4))
      expect(rangeList).to.deep.equal([bn(6), bn(11), bn(15), bn(18), bn(18), bn(19)])
      subtractRange(rangeList, bn(18), bn(19))
      expect(rangeList).to.deep.equal([bn(6), bn(11), bn(15), bn(18)])
      subtractRange(rangeList, bn(7), bn(8))
      expect(rangeList).to.deep.equal([bn(6), bn(7), bn(8), bn(11), bn(15), bn(18)])
      subtractRange(rangeList, bn(15), bn(18))
      expect(rangeList).to.deep.equal([bn(6), bn(7), bn(8), bn(11)])
      subtractRange(rangeList, bn(6), bn(7))
      expect(rangeList).to.deep.equal([bn(8), bn(11)])
      subtractRange(rangeList, bn(9), bn(10))
      expect(rangeList).to.deep.equal([bn(8), bn(9), bn(10), bn(11)])
      subtractRange(rangeList, bn(8), bn(9))
      expect(rangeList).to.deep.equal([bn(10), bn(11)])
      subtractRange(rangeList, bn(10), bn(11))
      expect(rangeList).to.deep.equal([])
    })
  })
})
