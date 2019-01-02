libek.Reticle = function(baseModel) {
  this.obj = new THREE.Object3D()  
  let targets = {}
  let clear = function() {}
  
  this.add = function(... args) {
    args = libek.util.flatten(args)
    for (let arg of args) {    
      let id = `${arg.x}|${arg.y}|${arg.z}`
      if (!targets[id]) {
        let t = libek.getAsset(baseModel)
        this.obj.add(t)
        t.position.copy(arg)
        targets[id] = t
      }
    }  
  }
  this.remove = function(... args) {
    args = libek.util.flatten(args)
    for (let arg of args) {    
      let id = `${arg.x}|${arg.y}|${arg.z}`
      let t = targets[id]
      if (t) {
        this.obj.remove(t)
        delete targets[id]
      }
    }  
  }
  this.clear = function() {
    for (let t of Object.values(targets)) {
      libek.releaseAsset(t)
    }
    targets = {}
  }
}