libek.Reticle = function(baseModel) {
  let MDL = new libek.Model()
  let INST = new MDL.Instance()
  let CMP = new INST.Component()
  this.obj = MDL.obj
  
  let targets = {}
  let clear = function() {}
  
  this.add = function(... args) {
    args = libek.util.flatten(args)
    for (let arg of args) {    
      let id = `${arg.x}|${arg.y}|${arg.z}`
      if (!targets[id]) {
        targets[id] = true
        CMP.setObject(id, baseModel).position.copy(arg)
      }
    }  
  }
  this.remove = function(... args) {
    args = libek.util.flatten(args)
    for (let arg of args) {    
      let id = `${arg.x}|${arg.y}|${arg.z}`
      if (targets[id]) {
        CMP.removeObject(id)
        delete targets[id]
      }
    }  
  }
  this.clear = function() {
    CMP.clear()
    targets = {}
  }
}