export { QueryTriggeredButtonControl, SceneviewController }
import { pickPlanepos, rad_tosector } from './libek.js'
import { direction } from './direction.js'
import { EventReaderPolicy, EventReader, EventReaderReturnType } from './event.js'

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
var QueryTriggeredButtonControl = function(params={}) {
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
      btn_evt = EventReaderPolicy(`read ${btns} reconfigure exit`)
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
    let rdr = new EventReader(evtman)
    rdr.returnType = EventReaderReturnType.Object
    while (true) {
      let evt = await rdr.next(btn_evt)  
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
}

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
//  Required input params:  
//    display             an instance of libek.Display
//    eventmanager:       an event manager (supposedly one attached to the display
//
//  Additional Recommended params:
//    onCamtargetChanged        callback for notifying when the camera target point changed (mostly to aid with visualization)
//    radmin, radmax, radstep   Controls camera's distance [in native units] from the camera target point, and moving speed when zooming
//    subunit                   How far the pick plane is shifted [in native units] when moved along its normal vector
var SceneviewController = function(params = {}) {  
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
   
  let clampCamposPHI = (function() {      
    this.campos.phi = Math.max( minphi, Math.min( maxphi, this.campos.phi ) );
  }).bind(this)
  
  let updcam_adjust_pickplane = params.UpdcamUpdatepickplane  
  
  // First-person mode:
  //  If fpmode is enabled, when the camera is fully zoomed in, fpmode gets activated and altered logic is used to make the camera controller act like a 
  //  first-person controller.
  //  while fpmode is active, the purpose of this.camtarget and this.campos are swapped (camtarget then is used to position the camera and campos is used to 
  //   orient the camera)
  //
  //  params.fpmode_notify:   callback for providing updates about what fpmode is doing.  These two arguments are passed to the callback:
  //         fpmode_on:       boolean flag to indicating whether fpmode is activate (true) or inactive (false)
  //         fpmode_moused:   boolean flag to indicate if fpmode is mouse-controlled (true) or program-controlled (false)
  //            (moused fpmode is active when the orbit button is held down while fpmode is on, allows User to freely and swivel the view,
  //             and should be regarded by the program as third-person view with the camera positioned at camtarget)
  //  params.fpmode_turnlen:  default amount of time to use to do a basic swivel animation (in milliseconds) when controlling from program logic.  
  //  params.fpmode_abs_offset: offset the fpmode camera position in absolute space
  //  params.fpmode_z_offset:   offset the fpmode camera along the camera-space z-axis
  
  let fpmode_enabled = params.fpmode_enabled
  let fpmode_fov = (params.fpmode_fov != undefined) ? params.fpmode_fov : this.disp.camera.fov
  let tpmode_fov = (params.tpmode_fov != undefined) ? params.tpmode_fov : this.disp.camera.fov
  let fpmode_z_offset = (params.fpmode_z_offset != undefined) ? params.fpmode_z_offset : 0
  let fpmode_abs_offset = params.fpmode_abs_offset ? params.fpmode_abs_offset : new THREE.Vector3()         
  let fpmode_notify = params.fpmode_notify ? params.fpmode_notify : doNothing    
  let fpmode_defaultturnlen = params.fpmode_turnlen ? params.fpmode_turnlen : 200
  let fp_turn_start, fp_turn_end, fpmode_turnlen
  let fpmode = false
  let fpunlocked = true
  let fptarget = new THREE.Spherical()
  this.setFPmode = function(mode, theta) {
    if (mode != fpmode) {
      fpmode = mode     
      if (fpmode) {          
        this.disp.camera.fov = fpmode_fov
        this.disp.camera.updateProjectionMatrix()
        if (theta != undefined) {
          this.campos.theta = theta
          this.updateCamera(false)
        }
      }
      else {
        this.disp.camera.fov = tpmode_fov
        this.disp.camera.updateProjectionMatrix()
      }
    }
  }
  this.swivel_camtheta = function(ntheta, turnlen) {
    if (fpmode && fpunlocked) {
      if (turnlen != undefined) {
        fpmode_turnlen = turnlen
      }
      else {
        fpmode_turnlen = fpmode_defaultturnlen
      }
      fp_turn_start = this.campos.theta
      fp_turn_end = ntheta
      this.evtman.dispatch_libek_event("fpadjust")
    }
  }
  
  this.disp.camera.fov = tpmode_fov
  this.disp.camera.updateProjectionMatrix()
  
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
      
  
  this.updateCamera = (function() {
    let pos = new THREE.Vector3()   
    let vec = new THREE.Vector3()
    return function(camtarget_changed) {
      if (fpmode) {
        pos.setFromSpherical(this.campos)    
        pos.negate()      
        vec.copy(pos)
        vec.normalize()
        vec.multiplyScalar(fpmode_z_offset)
        vec.add(this.camtarget)
        pos.add(this.camtarget)
        pos.add(fpmode_abs_offset)     
        this.disp.camera.position.copy( vec )    
        this.disp.camera.position.add(fpmode_abs_offset)   
        this.disp.camera.lookAt( pos );
      }
      else {
        pos.setFromSpherical(this.campos)
        pos.add(this.camtarget)
        this.disp.camera.position.copy(pos)    
        this.disp.camera.lookAt( this.camtarget );
        if (camtarget_changed && this.onCamtargetChanged) {
          this.onCamtargetChanged()
        }
      }
      if (this.onCamUpdate) {
        this.onCamUpdate(dx, dy)
      }
      if (updcam_adjust_pickplane) {
        this.pickplane.setFromNormalAndCoplanarPoint(this.pickplane.normal, this.camtarget)
        this.pickplane.constant *= -1
      }
    }
  })();
    
  this.run = async function() { 
  
    if (fpmode_enabled) {
      (async function fpmode_adjust() { 
        
        let main_evt = EventReaderPolicy(`read fpadjust`)
        let frame_evt = EventReaderPolicy(`read frame`)
        
        let rdr = new EventReader(this.evtman)
        rdr.returnType = EventReaderReturnType.Object
        while (true) {
          await rdr.next(main_evt)  
          
          let starttime = Date.now()
          let dt = 0
          while (dt < 1) {            
            await rdr.next(frame_evt) 
            let t = Date.now()
            dt = (t - starttime) / fpmode_turnlen  
            if (dt < 1) {
              this.campos.theta = ((fp_turn_start * (1-dt)) + (fp_turn_end * dt))
            }
            else {
              this.campos.theta = fp_turn_end 
            }              
            this.updateCamera(false)
          }
        }
      
      }).bind(this)()
    } 
      
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
                  
        let rdr = new EventReader(this.evtman)
        rdr.returnType = EventReaderReturnType.Object
        
        let configure = function() {
          main_event = EventReaderPolicy("read arrows reconfigure exit")
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
          if (this.pickplane.normal.equals(direction.vector.UP)) {
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
            let quad = rad_tosector(this.campos.theta, 4)              
            if (this.pickplane.normal.equals(direction.vector.SOUTH)) {
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
          main_evt = EventReaderPolicy(`read ${btndown} mousewheel_pos mousewheel_neg reconfigure exit`)
          orbit_evt = EventReaderPolicy(`read ${btnup} mousemove reconfigure finalize`)
        }
        configure()          
        let rdr = new EventReader(this.evtman)
        rdr.returnType = EventReaderReturnType.Object
        
        
        
        let prev_mpos, mpos
        
        main:
        while (true) {
          let evt = await rdr.next(main_evt)  
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
              if (fpmode_enabled && fpmode) {
                fpmode_notify(false, false)
                this.setFPmode(false)
              }
              this.updateCamera(false)
            break
            case "mousewheel_neg":
              //console.log(evt.data)
              this.campos.radius -= this.radstep
              if (this.campos.radius < this.radmin) {
                this.campos.radius = this.radmin
                if (fpmode_enabled && !fpmode) {
                  fpmode_notify(true, false)
                  this.setFPmode(true)
                }
              }
              this.updateCamera(false)
            break
            case btndown:
              prev_mpos = evt.data
              fpunlocked = false
              if (fpmode) {
                fpmode_notify(true, true)
              }
              orbit:
              while (true) {
                evt = await rdr.next(orbit_evt) 
                switch(evt.code) {
                  case "reconfigure": 
                    configure() 
                  break
                  case "exit": break main
                  case "mousemove":
                    let mpos = evt.data.clone()
                    let dx = -(mpos.x - prev_mpos.x)*this.rotspeed
                    let dy = (mpos.y - prev_mpos.y)*this.rotspeed                
                    prev_mpos = mpos
                    
                    this.campos.theta += dx
                    this.campos.phi += dy  
                    
                    clampCamposPHI()     
                    
                    this.updateCamera(false)
                    break
                  case btnup: 
                    fpunlocked = true
                    if (fpmode) {
                      fpmode_notify(true, false)
                    }
                    break orbit
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
          main_evt = EventReaderPolicy(`read ${btndown} quickrefocus reconfigure exit`)
          frame_evt = EventReaderPolicy(`read frame`)
        }
        configure()
        let rdr = new EventReader(this.evtman)
        rdr.returnType = EventReaderReturnType.Object
        
        main:
        while (true) {
          let evt = await rdr.next(main_evt)  
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
          main_evt = EventReaderPolicy(`read ${btndown} reconfigure exit`)
          follow_evt = EventReaderPolicy(`read ${btnup} frame reconfigure finalize`)
        }
        configure()
        
        let rdr = new EventReader(this.evtman)
        rdr.returnType = EventReaderReturnType.Object
        
        let chase = (function() {
          let mpos3d = pickPlanepos(this.disp, this.evtman.mpos, this.pickplane)
          let pos = mpos3d.clone()
          pos.sub(this.camtarget)
          pos.normalize()
          pos.multiplyScalar(this.followspeed*this.campos.radius)
          this.camtarget.add(pos)
          
          if (this.pickplane.normal.equals(direction.vector.UP)) {
            this.camtarget.y = this.pickplane.constant
          }
          else if (this.pickplane.normal.equals(direction.vector.SOUTH)) {
            this.camtarget.z = this.pickplane.constant
          }
          else if (this.pickplane.normal.equals(direction.vector.EAST)) {
            this.camtarget.x = this.pickplane.constant
          }
          
          this.updateCamera(true)
        }).bind(this)
        
        main:
        while (true) {
          let evt = await rdr.next(main_evt)  
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