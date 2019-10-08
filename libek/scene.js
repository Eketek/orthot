export { VxScene }
import { Space } from './space.js'
import { direction } from './direction.js'
/* 

*/
let VxScene = function(params={}) {
  let chunksize = params.chunksize ? parmas.chunksize : 8  
  let half_chunksize = chunksize/2
  let chunks_per_tick = params.chunks_per_tick ? params.chunks_per_tick : .1 
  
  let boxterrain = params.boxterrain
    
  let chunks = {}
    
  // VxScene encapsulates and is stronly coupled with an instance of libek.Space
  let space
  
  // Clear out all data without touching chunk data (this is for quickly resetring scenes which do not use dynamic terrain)
  this.resetData = function() {
    let _default
    if (space) {
      let _default = space.default
    }
    space = new Space()
    this.get = space.get
    this.put = space.put
    this.remove = space.remove
    this.forAll = space.forAll
    if (_default) {
      space.default = _default
    }
  }
  this.resetData()
  
  Object.defineProperty(this, 'default', {set: val => { space.default = val}})
  
  this.scene = new THREE.Object3D()
  
  this.dispose = function() {
    for (let chk of Object.values(chunks)) {
      if (chk.obj) {
        this.scene.remove(chk.obj)
        chk.obj.geometry.dispose()
      }
    }
  }
  
  let buildChunks_amt = 0
  
  // Gradual Terrain Updater
  //  This builds or rebuilds terrain chunks at a rate no higher than the amount specified by params.chunks_per_tick
  //  Non-integer or fractional amounts will work
  this.buildChunks = function() {
    if (invalidChunks.length > 0) {
      buildChunks_amt += chunks_per_tick
      while (buildChunks_amt > 0) {
        let chk = invalidChunks.shift()
        let obj = chk.obj
        if (obj) {
          obj.geometry.dispose()
          this.scene.remove(obj)          
        }
        obj = boxterrain.build(space, {min:chk, max:{x:chk.x+chunksize,y:chk.y+chunksize,z:chk.z+chunksize}})
        this.scene.add(obj)
        chk.obj = obj
        buildChunks_amt--
        if (invalidChunks.length == 0) {
          buildChunks_amt = 0
          break
        }
      }
    }
  }
  
  //assign a terrain value without touching chunk data (this is for quickly resetting scenes which do not use dynamic terrain)
  this.assignTerrain = function(x,y,z, id) {
    this.get(x,y,z).terrain = id
  }
  
  this.loadTerrain = function(x,y,z, id) {
    let ctn = this.get(x,y,z)
    if (!ctn.terrain) {
      ctn.terrain = {id:id}
    }
    else {
      ctn.terrain.id = id
    }
    let chk = getChunk(x,y,z)
    if (invalidChunks.indexOf(chk) == -1) {
      invalidChunks.push(chk)
    }
  }
  
  this.setTerrain = function(x,y,z, id) {
    let ctn = this.get(x,y,z)
    if (!ctn.terrain) {
      ctn.terrain = {id:id}
    }
    else {
      ctn.terrain.id = id
    }
    
    getChunk(x,y,z)
    update_AffectedChunks(x,y,z)
  }
  
  /*  Add a "knockout" flag to the terrain  
      knockout flags cause the terrain mesh generator to omit the face from the output mesh which is "knocked out"
      The main use for this is to avoid rendering permanantly obscured terrain
      (Orthot II used similar functionality as a hack to try to prevent it from crashing when loading puzzles with many fixed objects )
  */
  this.setTerrainKnockout = function(ctn, dir, val=true) {
    if (!ctn.terrain) {
      ctn.terrain = {}
    }
    switch(dir) {
      case direction.code.UP:
        ctn.terrain.koU = val
      break
      case direction.code.DOWN:
        ctn.terrain.koD = val
      break
      case direction.code.NORTH:
        ctn.terrain.koN = val
      break
      case direction.code.EAST:
        ctn.terrain.koE = val
      break
      case direction.code.SOUTH:
        ctn.terrain.koS = val
      break
      case direction.code.WEST:
        ctn.terrain.koW = val
      break
    }
  }
  this.setTerrainKnockout_bypos = function(x,y,z, dir, val=true) {
    this.setTerrainKnockout(this.get(x,y,z), dir, val)
  }  
  
  let getChunk = function(x,y,z) {
    let chkx = Math.floor(x/chunksize)
    let chky = Math.floor(y/chunksize)
    let chkz = Math.floor(z/chunksize)
    let addr = `CHK|${chkx},${chky},${chkz}`
    let r = chunks[addr]
    if (!r) {
      r = {x:chkx*chunksize,y:chky*chunksize,z:chkz*chunksize}
      chunks[addr] = r
    }
    return r
  }
  let invalidChunks = []
  let updateChunk = function(x,y,z) {
    let addr = `CHK|${x},${y},${z}`
    let chk = chunks[addr]
    if (chk && (invalidChunks.indexOf(chk) == -1)) {
      invalidChunks.push(chk)
    }
  }
  let update_AffectedChunks = function(x,y,z) {   
    let chkx = Math.floor(x/chunksize)
    let chky = Math.floor(y/chunksize)
    let chkz = Math.floor(z/chunksize)
    let nx=x%chunksize
    let ny=y%chunksize
    let nz=z%chunksize
    if (nx<0) nx+= chunksize
    if (ny<0) ny+= chunksize
    if (nz<0) nz+= chunksize
    nx--
    ny--
    nz--
    
    if (nx>0) {
      nx = (nx!=chunksize) ? 0 : 1
    }
    if (ny>0) {
      ny = (ny!=chunksize) ? 0 : 1
    }
    if (nz>0) {
      nz = (nz!=chunksize) ? 0 : 1
    }
    
    switch(((nx!=0)) | ((ny!=0)<<1) | ((nz!=0)<<2)) {
      case 0:      // 
        updateChunk(chkx,    chky,    chkz)
      break
      case 1:      // EW 
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx+nx, chky,    chkz)
      break
      case 2:      // UD 
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx,    chky+ny, chkz)
      break
      case 3:      // EW UD 
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx+nx, chky,    chkz)
        updateChunk(chkx,    chky+ny, chkz)
        updateChunk(chkx+nx, chky+ny, chkz)
      break
      case 4:      // NS 
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx,    chky,    chkz+nz)
      break
      case 5:      // EW NS
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx+nx, chky,    chkz)
        updateChunk(chkx,    chky,    chkz+nz)
        updateChunk(chkx+nx, chky,    chkz+nz)
      break
      case 6:      // UD NS
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx,    chky+ny, chkz)
        updateChunk(chkx,    chky,    chkz+nz)
        updateChunk(chkx,    chky+ny, chkz+nz)
      break
      case 7:      // EW UD NS
        updateChunk(chkx,    chky,    chkz)
        updateChunk(chkx+nx, chky,    chkz)
        updateChunk(chkx,    chky+ny, chkz)
        updateChunk(chkx+nx, chky+ny, chkz)
        updateChunk(chkx,    chky,    chkz+nz)
        updateChunk(chkx+nx, chky,    chkz+nz)
        updateChunk(chkx,    chky+ny, chkz+nz)
        updateChunk(chkx+nx, chky+ny, chkz+nz)
      break
    }
    
  }
}









