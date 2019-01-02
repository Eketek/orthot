
libek.control = {

  /*  Controller which reads Buttons through arbitrary periods of time, retains a list of which buttons were recently pressed, 
        and when queried, provides the list of pressed buttons and resets      
      
     This basically is an input receiver for applications which use tick-based timing with long intervals
       
     params:
       buttons:  [required]  space-delimited list of buttons names or button groups to read
       evtman:   [required]  A libek.event.Manager
       readheldbuttons:   [option]  If true, watched buttons which are held down will be included in the query-result
       onInputAvailable:  [option]  If provided, this is a callback for indicating when new input is available 
                                    query() will still need to be called to fetch the buttons
                                    (this is intended to help make tick-based applications more responsive when nothing important is going on)
  */
  QueryTriggeredButtonControl:function(params={}) {
    let btns = params.buttons   
    let evtman = params.eventmanager
    let held = params.readheldbuttons
    let state = { }
    let inpCallback = params.onInputAvailable
    let hld_mask = []
    
    // Call this when the application is ready to start accepting input
    this.run = (async function() {
      let btn_evt
      let configure = function() {
        btn_evt = libek.event.policy(`read ${btns} reconfigure exit`)
        hld_mask = []
        for (let btnname in btn_evt) {
          if (btnname.indexOf('_') != -1) {
            if ( (btnname != "reconfigure") && (btnname != "exit") ) {
              hld_mask.push(btnname.substring(0, btnname.indexOf('_')))
            }
          } 
        }
      }
      configure()
      let rdr = new libek.event.Reader(evtman)
      rdr.returnType = libek.event.ReadReturnType.Object
      while (true) {
        evt = await rdr.next(btn_evt)  
        switch(evt.code) {
          case "reconfigure":
            configure()
          break
          case "exit":
            return
          break
          default:
            let code = evt.code
            let _ = code.indexOf('_')
            if ( _ != -1) {
              code = code.substring(0, _)
            }
            state[code] = true
            if (inpCallback) {
              inpCallback()
            }
        }
        //console.log(evtman.DownKeys.ArrowDown)
      }
      
    }).bind(this)
    
    // Return the list of recently pressed buttons (+bttons held down if the readheldbuttons option is set)
    this.query = function() {
      if ( held ) {
        for (let kname of hld_mask) {
          if (evtman.DownKeys[kname]) {
            state[kname] = evtman.DownKeys[kname]
          }
        }
      }
      let r = state
      state = {}
      return r
    }
  },

  // A partial User-Interface which provides various fixed-function camera controllers.
  //  This is intended to be basic SceneView functionality for applications which use libek.
  //  All controllers here are optional and need specific configuration to enable
  //
  //  Controllers:
  //    OrbitTarget     - Camera uses mouse movement to orbit the camera target while active
  //    ChaseTarget     - Moves camtarget along the picking plane toward the current mouse position [as projected onto the picking plane] while active
  //    RefocusTarget   - When triggered, gradually shifts the camera target from its initial position to a "refocus" position
  //    ShiftPickPlane  - Shift the picking plane along its normal vector
  //
  //  TODO:  FirstpersonView - sets FP view mode, disables other camera controllers, optionally hides an Object3D while active
  //
  //  Required input params:  
  //    display             an instance of libek.Display
  //    eventmanager:       an event manager (supposedly one attached to the display
  //
  //  Additional Recommended params:
  //    onCamtargetChanged        callback for notifying when the camera target point changed (mostly to aid with visualization)
  //    radmin, radmax, radstep   Controls camera's distance [in native units] from the camera target point, and moving speed when zooming
  //    subunit                   How far the pick plane is shifted [in native units] when moved along its normal vector
  SceneviewController:function(params = {}) {  
    this.disp = params.display
    this.evtman = params.eventmanager
    
    this.camtarget = params.camtarget ? params.camtarget : new THREE.Vector3()
    this.pickplane = params.pickplane ? params.pickplane : new THREE.Plane()
        
    //camera orbit and movement speed attributes
    this.radmin = params.radmin ? params.radmin : 1
    this.radmax = params.radmax ? params.radmax : 12
    this.radstep = params.radstep ? params.radstep : 0.5    
    this.rotspeed = params.rotspeed ? params.rotspeed : 4    
    this.followspeed = params.followspeed ? params.followspeed : 1/60
    
    this.subunit = params.subunit ? params.subunit : 1/32
    this.high_subunit_scale = params.high_subunit_scale ? params.high_subunit_scale : 8
    
    //callback for when the camera's target (focus point) was altered  - 
    this.onCamtargetChanged = params.onCamtargetChanged  
    this.onCamUpdate = params.onCamUpdate
           
    //Set up the camera
    let init_campos = params.init_campos ? params.init_campos : new THREE.Vector3(3, 3, 6)  
    this.campos = new THREE.Spherical() 
    
    let minphi = (params.campos_minphi != undefined) ? params.campos_minphi : 0.000001
    let maxphi = (params.campos_maxphi != undefined) ? params.campos_maxphi : Math.PI - 0.000001
     
    clampCamposPHI = (function() {      
      this.campos.phi = Math.max( minphi, Math.min( maxphi, this.campos.phi ) );
    }).bind(this)
    
    let updcam_adjust_pickplane = params.UpdcamUpdatepickplane  
    
    this.setCamposFromCartisian = function(cart_pos) {
      this.campos.setFromVector3(cart_pos)
      clampCamposPHI()    
      if (this.campos.radius < this.radmin) {
        this.campos.radius = this.radmin
      }
      if (this.campos.radius > this.radmax) {
        this.campos.radius = this.radmax
      }
    }
    this.setCamposFromCartisian(init_campos)
        
    
    this.updateCamera = function(camtarget_changed) { 
      let pos = new THREE.Vector3()   
      pos.setFromSpherical(this.campos)
      pos.add(this.camtarget)
      this.disp.camera.position.copy(pos)    
      this.disp.camera.lookAt( this.camtarget );
      if (camtarget_changed && this.onCamtargetChanged) {
        this.onCamtargetChanged()
      }
      if (this.onCamUpdate) {
        this.onCamUpdate()
      }
      if (updcam_adjust_pickplane) {
        this.pickplane.setFromNormalAndCoplanarPoint(this.pickplane.normal, this.camtarget)
        this.pickplane.constant *= -1
      }
    }
      
    this.run = async function() { 
        
      // A controller which shifts the pick plane around when the arrow keys are pressed.
      if (params.PickPlane_ArrowkeyController) {
        (async function PickPlane_ArrowkeyController() {          
          //decision tables to control how the X and Z picking planes are shifted by arrow keys
          // index bits 1 and 2 are derived from the quadrant the camera is located in
          // index bits 3 and 4 are taken from the arrow key pressed
          //  These are OR'd together to determine which direction is approximately intuitive for a picking plane shift
          let ektbl = [-1,-1,1,1, 1,1,-1,-1, -1,1,1,-1, 1,-1,-1,1]
          let nktbl = [-1,1,1,-1, 1,-1,-1,1, 1,1,-1,-1, -1,-1,1,1]
          let U = 0
          let D = 4
          let L = 8
          let R = 12
          
          let main_event
                    
          let rdr = new libek.event.Reader(this.evtman)
          rdr.returnType = libek.event.ReadReturnType.Object
          
          let configure = function() {
            main_event = libek.event.policy("read arrows reconfigure exit")
          }
          configure()
          
          let d

          // manage arrow keys.  This is a little complex due to logic to match arrow keys with the current 3d perspective
          let processArrow = (function(k) {               
            d = this.subunit
            //console.log("shift-amt:" + d)
            //console.log(_this.evtman.DownKeys)
            if (this.evtman.DownKeys.Shift) {
              d *= this.high_subunit_scale
            }
            if (this.pickplane.normal.equals(libek.direction.vector.UP)) {
              if (evt.code == "ArrowUp_down") {
                //pickplane.constant -= d
                this.camtarget.y += d
              }
              else if (evt.code == "ArrowDown_down") {
                //pickplane.constant += d
                this.camtarget.y -= d
              }
            }
            else {
              let quad = libek.rad_tosector(this.campos.theta, 4)              
              if (this.pickplane.normal.equals(libek.direction.vector.SOUTH)) {
                //console.log("NORTH  ... quad="+quad + " k="+k)
                this.camtarget.z += nktbl[quad|k]*d          
              }
              else {
                //console.log("EAST  ... quad="+quad + " k="+k)
                this.camtarget.x += ektbl[quad|k]*d        
              }
            }
            this.updateCamera(true)
          }).bind(this)
          
          main:
          while (true) {
            evt = await rdr.next(main_event)  
            switch(evt.code) {
              case "reconfigure": 
                configure() 
              break
              case "exit": break main
              case "ArrowUp_down":
                processArrow(U)
              break
              case "ArrowDown_down":
                processArrow(D)
              break
              case "ArrowLeft_down":
                processArrow(L)
              break
              case "ArrowRight_down":
                //console.log(R)
                processArrow(R)
              break
            }
          }
          
        }).bind(this)()
      }
      
      // A controller which causes the camera to use mouse movement to orbit the camera target while a mouse button is held down
      if (params.OrbitTargetMBTN) {
        (async function OrbitTarget_MouseController() {  
          let btndown = params.OrbitTargetMBTN + "_down"
          let btnup = params.OrbitTargetMBTN + "_up"
          let main_evt, orbit_evt   
          let configure = function() {
            main_evt = libek.event.policy(`read ${btndown} mousewheel_pos mousewheel_neg reconfigure exit`)
            orbit_evt = libek.event.policy(`read ${btnup} mousemove reconfigure finalize`)
          }
          configure()          
          let rdr = new libek.event.Reader(this.evtman)
          rdr.returnType = libek.event.ReadReturnType.Object
          
          
          
          let prev_mpos, mpos
          
          main:
          while (true) {
            evt = await rdr.next(main_evt)  
            switch(evt.code) {            
              case "reconfigure": 
                _configure() 
              break
              case "exit": break main              
              case "mousewheel_pos":
                this.campos.radius += this.radstep
                if (this.campos.radius > this.radmax) {
                  this.campos.radius = this.radmax
                }
                this.updateCamera(false)
              break
              case "mousewheel_neg":
                //console.log(evt.data)
                this.campos.radius -= this.radstep
                if (this.campos.radius < this.radmin) {
                  this.campos.radius = this.radmin
                }
                this.updateCamera(false)
              break
              case btndown:
                prev_mpos = evt.data
                orbit:
                while (true) {
                  evt = await rdr.next(orbit_evt) 
                  //console.log(evt.data)
                  switch(evt.code) {
                    case "reconfigure": 
                      configure() 
                    break
                    case "exit": break main
                    case "mousemove":
                      mpos = evt.data.clone()
                      dx = -(mpos.x - prev_mpos.x)*this.rotspeed
                      dy = (mpos.y - prev_mpos.y)*this.rotspeed                
                      prev_mpos = mpos
                      
                      this.campos.theta += dx
                      this.campos.phi += dy  
                      
                      clampCamposPHI()     
                      
                      this.updateCamera(false)
                    break
                    case btnup: break orbit
                  }
                }
              break
            }
          }
        }).bind(this)()
      } 
      
      // A controller which, when triggered, "refocuses" the view on a particular point
      // The refocus operation is linear interpolation [over real-time] between the initial value of this.camtarget and this.refocustarget
      //    This is a simple way to allow transient camera targets
      if (params.RefocusTargetMBTN) {
        (async function Refocus_Controller() {          
          let len = params.RefocusLen ? params.RefocusLen : 1000  //milliseconds
          let quicklen = params.QuickRefocusLen ? params.QuickRefocusLen : 500
          let qrefocus = false
          if (!this.refocustarget) {
            this.refocustarget = new THREE.Vector3()
          }
          
          let adjust_pickplane = params.RefocusUpdatepickplane
          let main_evt, frame_evt
          let btndown = params.RefocusTargetMBTN + "_down"         
          let vec = new THREE.Vector3()
          let configure = function() {
            main_evt = libek.event.policy(`read ${btndown} quickrefocus reconfigure exit`)
            frame_evt = libek.event.policy(`read frame`)
          }
          configure()
          let rdr = new libek.event.Reader(this.evtman)
          rdr.returnType = libek.event.ReadReturnType.Object
          
          main:
          while (true) {
            evt = await rdr.next(main_evt)  
            switch(evt.code) {
              case "reconfigure": 
                configure() 
              break
              case "exit": break main
              case "quickrefocus":
                qrefocus = true
              case btndown:
                let start = this.camtarget.clone()
                                
                //console.log("refocus", start, this.refocustarget)
                
                let starttime = Date.now()
                while (true) {
                  let __evt = await rdr.next(frame_evt)
                  let t = Date.now()
                  let dt
                  if (qrefocus) {
                    dt = (t - starttime) / quicklen
                  }
                  else {                  
                    dt = (t - starttime) / len
                  }
                  if (dt < 1) {
                    vec.lerpVectors(start, this.refocustarget, dt)     
                    this.camtarget.copy(vec)  
                    if (adjust_pickplane) {
                      this.pickplane.setFromNormalAndCoplanarPoint(this.pickplane.normal, vec)
                      this.pickplane.constant *= -1
                    }
                    this.updateCamera(true)
                  }
                  else {                  
                    if (qrefocus) {
                      qrefocus = false
                    }
                    this.camtarget.copy(this.refocustarget)
                    if (adjust_pickplane) {
                      this.pickplane.setFromNormalAndCoplanarPoint(this.pickplane.normal, this.refocustarget)
                      this.pickplane.constant *= -1
                    }
                    this.updateCamera(true)
                    break
                  }
                }
              break
            }
          }
        }).bind(this)()
      }
      
      if (params.ChaseTargetMBTN) {
        (async function ChaseTarget_MouseController() {  
          let main_evt, follow_evt
          let btndown = params.ChaseTargetMBTN + "_down"
          let btnup = params.ChaseTargetMBTN + "_up"
          let configure = function() {
            main_evt = libek.event.policy(`read ${btndown} reconfigure exit`)
            follow_evt = libek.event.policy(`read ${btnup} frame reconfigure finalize`)
          }
          configure()
          
          let rdr = new libek.event.Reader(this.evtman)
          rdr.returnType = libek.event.ReadReturnType.Object
          
          let chase = (function() {
            let mpos3d = libek.pick.planepos(this.disp, this.evtman.mpos, this.pickplane)
            let pos = mpos3d.clone()
            pos.sub(this.camtarget)
            pos.normalize()
            pos.multiplyScalar(this.followspeed*this.campos.radius)
            this.camtarget.add(pos)
            
            if (this.pickplane.normal.equals(libek.direction.vector.UP)) {
              this.camtarget.y = this.pickplane.constant
            }
            else if (this.pickplane.normal.equals(libek.direction.vector.SOUTH)) {
              this.camtarget.z = this.pickplane.constant
            }
            else if (this.pickplane.normal.equals(libek.direction.vector.EAST)) {
              this.camtarget.x = this.pickplane.constant
            }
            
            this.updateCamera(true)
          }).bind(this)
          
          main:
          while (true) {
            evt = await rdr.next(main_evt)  
            switch(evt.code) {
              case "reconfigure": 
                configure() 
              break
              case "exit": break main
              case btndown:          
                chase()
                dochase:
                while(true) {
                  evt = await rdr.next(follow_evt) 
                  switch(evt.code) {
                    case "reconfigure": 
                      _configure() 
                    break
                    case "exit": break main
                    case "frame":
                      chase()
                    break
                    case btnup: break dochase
                  }
                }
              break
            }
          }   
              
        }).bind(this)()
      }         
      this.updateCamera(true)    
    }
  }
}