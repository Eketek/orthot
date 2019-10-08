export { Space }

// Discrete-space Volumetric Container
//  Basically voxel-based storage
//   This was somethign just hacked out without regard for performance testing (or even a comparison to just converting the coordinates to a string to index
//   a basic associative array)
var Space = function() {

  let e30 = 1<<30
  
  let x,y,z, lx,ly,lz, addr, block   

  let blocks = {}
  this.bks = blocks
  
  this.default = function(_x, _y, _z) {
    this.x = _x
    this.y = _y
    this.z = _z
  }
  
  this.forAll = (function(func) {
    for (let blk of Object.values(blocks)) {
      for (let obj of Object.values(blk)) {
        func(obj)
      }
    }
  }).bind(this)
  
  // Put the specified value at the specified location
  this.put = (function(_x,_y,_z, obj) {
    x = _x
    y = _y
    z = _z
    resolve()       
    block[addr] = obj
  }).bind(this)
  
  this.get = (function(_x,_y,_z) {
    x = _x
    y = _y
    z = _z
    resolve() 
    let r = block[addr]
    if (!r) {
      r = new this.default(_x, _y, _z)
      block[addr] = r
    }
    return r     
  }).bind(this)
  
  // Remove the object at the specified location
  this.remove = (function(_x,_y,_z) {
    x = _x
    y = _y
    z = _z
    resolve()  
    let obj = block[addr]
    delete block[addr]
    return obj
  }).bind(this)
  
  // Sample the data
  //  This sampling function is intended for sampling a set of locations nearby an absolute position
  //  The query is called once per requested sample.
  //  If there is data at a sampled location, the query function will receive a reference to the array containing the data.
  //  If there is no data at a sampled location, the sample function will receive either a zero-length array or undefined.
  this.sample = function(_x,_y,_z, query, ... locs_rel) {
    x = _x
    y = _y
    z = _z
    resolve()
    let result = []
    for (let i = 0; i < locs_rel.length; i+=3) {
      result.push(query(get_rel(locs_rel[i], locs_rel[i+1], locs_rel[i+2])))
    }
    return result
  }
  
  let get_rel = function(_x,_y,_z) {
    let rx = _x
    let ry = _y
    let rz = _z
    let smpx = lx+rx
    let smpy = ly+ry
    let smpz = lz+rz
    
    if ( (smpx >= 0) && (smpx < 1024) && (smpy >= 0) && (smpy < 1024) && (smpz >= 0) && (smpz < 1024) ) {
      let smpaddr = smpx | (smpy<<10) | (smpz<<20)
      return block[smpaddr]
    }
    else {
      rx = (rx + x) % e30
      ry = (ry + y) % e30
      rz = (rz + z) % e30
      if (rx < 0) rx += e30
      if (ry < 0) ry += e30
      if (rz < 0) rz += e30

      
      let blkID = ((rx&0xffc00)>>>10) | (ry&0xffc00) | ((rz&0xffc00)<<10)
      let _block = blocks[blkID]
      if (!_block) {
        return undefined
      }
      
      return _block[(rx&1023) | ((ry&1023) <<10) | ((rz&1023) <<20)]
    }
  }
  
  let resolveCTN = function() {
    obj = block[addr]
  }
  
  let resolve = function() {
    x %= e30
    y %= e30
    z %= e30
    if (x < 0) x += e30
    if (y < 0) y += e30
    if (z < 0) z += e30
    
    let blkID = ((x&0xffc00)>>>10) | (y&0xffc00) | ((z&0xffc00)<<10)
    block = blocks[blkID]
    if (!block) {
      blocks[blkID] = block = {}
    }
    
    lx = x&1023
    ly = y&1023
    lz = z&1023
    
    addr = lx | (ly<<10) | (lz<<20)
    
  }
}