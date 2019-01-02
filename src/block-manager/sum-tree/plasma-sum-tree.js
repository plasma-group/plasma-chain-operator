const { MerkleSumTree, MerkleTreeNode } = require('./sum-tree')
const BN = require('web3').utils.BN

class PlasmaMerkleSumTree extends MerkleSumTree {
  parseLeaves (leaves) {
    leaves = leaves.map((leaf) => {
      let TR = leaf.transferRecords.elements[leaf.TRIndex]
      let enc = leaf.encode()
      return {
        typedStart: new BN(TR.type.toString(16, 8) + TR.start.toString(16, 24), 16),
        typedEnd: new BN(TR.type.toString(16, 8) + TR.end.toString(16, 24), 16),
        encoding: '0x' + new BN(enc).toString(16, 2 * enc.length)
      }
    })
    leaves[0].typedStart = new BN(0) // start of the leaf's coverage is 0 to the sum tree, even if TR is not
    leaves.push({typedStart: new BN('ffffffffffffffffffffffffffffffff', 16)}) // add a fake final TR which happens at the final coinpost
    let parsed = []
    for (let i = 0; i < leaves.length - 1; i++) {
      let range = leaves[i + 1].typedStart.sub(leaves[i].typedStart)
      parsed.push(new MerkleTreeNode(this.hash(leaves[i].encoding), range))
    }
    return parsed
  }

  getBranch (leafIndex) { // returns an array of nodes which can be use to verify the merkle branch
    if (leafIndex >= this.getHeight() || leafIndex < 0) { throw new Error('invalid branch index requested') }
    let proof = []
    let nodeIndex = Math.floor(leafIndex / 2) * 2
    for (let i = 0; i < this.getHeight(); i++) {
      proof.push(this.getNode(i, nodeIndex))
      proof.push(this.getNode(i, nodeIndex + 1))
      nodeIndex = Math.floor(nodeIndex / 4) * 2
    }
    return proof.map((node) => {
      return (node === undefined) ? this.emptyNode() : node
    })
  }
}

module.exports = PlasmaMerkleSumTree
