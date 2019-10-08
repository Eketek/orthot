export { Model }

import { releaseAsset, getAsset } from './libek.js'

/*
  Yet another attempt at extending the concept of a 3D Object to include:
    
  Instancing 
    Object should be able to manage multiple renderable instances of itself, with differing states per-instance.
    NOTE:  This is not to be confused with hardward geometry instancing.  Same concept, but a fairly different purpose.
           This is high-level instancing, and done solely for simplified high-level code, not for performance
    
  Heirarchy
    Ability to name specific points to bind child objects to.
    Unlike conventional scenegraphs, the child's transform belongs to the Instance/Parent controller.
    
  Animation/Progammable Controls
    Animation controller which uses actual code [as opposed to animation data].  Executes guaranteed keyframe events and non-guaranteed per-frame events.
    
  This mainly is intended as an abstraction layer to allow animated 3D object-groups to render on both sides while passing through portals.
*/
var Model = function(assets, params={}) {
  this.isModelMain = true
  this.obj = new THREE.Object3D()
  this.instances = {}  
  this.nmap = params.nmap ? params.nmap : {}
  this.default = params.default
  this.ctl = {}
  
  let model = this
  
  this.destroy = function() {
    for (let inst of Object.values(this.instances)) {
      for (let cmp of inst.components) {
        for (let obj of Object.values(cmp.content)) {
          releaseAsset(assets, obj)
        }
      }
    }
  }
  
  this.Instance = function(instname, configure, init_show=true) {
    if (!instname) {
      instname = "libek.Model.Instance"
    }
    model.instances[instname] = this
    let instance = this
    
    this.isModelInstance = true
    
    let components = this.components = []
    this.ctl = {}
          
    this.Component = function() {
      this.obj = new THREE.Object3D()
      this.matrix = new THREE.Matrix4()
      this.obj.matrix = this.matrix
      this.obj.matrixAutoUpdate = false
      if (init_show) {
        model.obj.add(this.obj)
      }
      
      this.show = (function() {
        if (model.obj.children.indexOf(this.obj) == -1) {
          model.obj.add(this.obj)
        }
      }).bind(this);
      
      this.hide = (function() {
        if (model.obj.children.indexOf(this.obj) != -1) {
          model.obj.remove(this.obj)
        }
      }).bind(this);
      
      this.content = {}      
      this.setObject = function(objname, mdlarg) {
        
        let obj = this.content[objname]    
        if (obj) { 
          releaseAsset(assets, obj)
        }    
        if (mdlarg) {
          if (typeof(mdlarg) == "function") {
            obj = mdlarg()
          }
          else  if (typeof(mdlarg) == "string") {
            obj = getAsset(assets, model.nmap[mdlarg] ? model.nmap[mdlarg] : mdlarg )
          }
          else if (typeof(mdlarg) == "object") { 
            obj = getAsset(assets, mdlarg )
          }
        }
        else if (typeof(model.default) == "function") {
          obj = model.default()
        }
        else {
          obj = getAsset(assets, model.default)
        }                
        this.obj.add(obj)
        this.content[objname] = obj
        
        return obj
      }      
      this.getObject = function(objname) {  
        return this.content[objname]
      }
      this.removeObject = function(objname) {
        let obj = this.content[objname]    
        if (obj) {   
          releaseAsset(assets, obj)
        }    
        delete this.content[objname]        
      }
      this.clear = function() {
        for (let obj of this.obj.children) {
          releaseAsset(assets, obj)   
        }
        this.content = {}
      } 
      components.push(this)
    }
    
    this.removeComponent = function(cmp) {
      for (let obj of cmp.obj.children) {
        releaseAsset(assets, obj)   
      }
      this.model.obj.remove(cmp.obj)
      this.components.splice(this.components.indexOf(cmp))
    } 
    
    this.duplicate = function(dupname) {    
      let inst = new model.Instance(dupname, configure)
      return inst
    }
    if (configure) {
      configure(this)
    }
  }
}