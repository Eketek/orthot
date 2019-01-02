/*  Orthot III application logic
    This prepares global controls, loads game data, configures base objects (default materials),
*/

// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = {
  uv2:new libek.shader.UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

//Level data, high-level state, and "Orthot" functions
var orthot = {
  zones:{},
  tiles:{},  
  version:"0.3.0"
}

$(async function() {

  libek.init() 
  
  let disp_elem = $("#test").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )  
  disp_elem.focus()
  renderCTL.display = libek.Display(disp_elem)
  
  //console.log(renderCTL)
  
  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  
  await libek.loadMuch( 
    {url:"orthot/textures/patterns.png", properties:TextureProps},
    {url:"orthot/textures/wall_8bit_fg.png", properties:TextureProps},
    {url:"orthot/textures/symbols.png", properties:TextureProps},
  )
  await libek.loadZIP('orthot/models.zip')
  await libek.loadZIP('orthot/ekvxdat.zip')
    
  orthot.tiles.key = {
    source:assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
    
  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
    
  renderCTL.fg = new libek.shader.ManagedColor("yellow")
  renderCTL.bg1 = new libek.shader.ManagedColor("orange")
  renderCTL.bg2 = new libek.shader.ManagedColor("green")
         
  renderCTL.vxlMAT = libek.shader.buildVariantMaterial("standard", {
    map:assets.wall_8bit_fg, 
    bkgtex:assets.patterns,
    uv2:renderCTL.uv2, 
    roughness:0.76, 
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.fg}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.bg1}*bc.g + ${renderCTL.bg2}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })
  
  let manmats = ["hsl(25, 80%, 60%)", "blue", "brown", "black", {color:"black", metalness:1}, {color:"white", emissive:"yellow", emissiveIntensity:1}]
  
  libek.assignMaterials(assets.man, manmats)
  libek.assignMaterials(assets.man2, manmats)
  libek.assignMaterials(assets.man_walk, manmats)
  libek.assignMaterials(assets.man_push, manmats)
  libek.assignMaterials(assets.man_pushwalk, manmats)
  libek.assignMaterials(assets.man_climb, manmats)
  libek.assignMaterials(assets.man_leap, manmats)
  libek.assignMaterials(assets.man_pushleap, manmats)
  libek.assignMaterials(assets.man_slide1, manmats)
  libek.assignMaterials(assets.man_slide2, manmats)
  libek.assignMaterials(assets.man_slide3, manmats)
  libek.assignMaterials(assets.man_slide4, manmats)
  libek.assignMaterials(assets.man_slide5, manmats)
  
  libek.assignMaterials(assets.scene_portal, {color:"white", emissive:"white", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5})
  libek.assignMaterials(assets.portal_pane, "white", "yellow", {color:"blue", transparent:true, opacity:0.25}, "white" )
  libek.assignMaterials(assets.pushblock, ["white", "red", "black"])
  libek.assignMaterials(assets.lock, ["white", "black"])
  libek.assignMaterials(assets.crate, ["hsl(20, 100%, 50%)", "black", "hsl(25, 90%, 25%)", "hsl(22, 100%, 55%)" ])
  
  let markmats = [{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  
  libek.assignMaterials(assets.CubeMark, markmats)
  libek.assignMaterials(assets.FaceMark, markmats)
  libek.assignMaterials(assets.CubeCursor, cursormats)
  libek.assignMaterials(assets.FaceCursor, cursormats)
  
  var evtman = new libek.event.Manager( disp_elem )
  inputCTL.EventManager = evtman
  
  inputCTL.keystate = new libek.control.QueryTriggeredButtonControl({
    buttons:"arrows space keys:w a s d",
    eventmanager:evtman,
    readheldbuttons:true,
    onInputAvailable:function() {
      if (orthot.ActiveZone) {
        orthot.ActiveZone.inputAvailable()
      }
    }
  })
  inputCTL.keystate.run()
    
  sviewCTL = new libek.control.SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    eventmanager:evtman,
    pickplane:new THREE.Plane(libek.direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    
    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"lmb",    
    RefocusTargetMBTN:"mmb",
    RefocusUpdatepickplane:true,
    RefocusLen:700,
    QuickRefocusLen:150,
    
  })  
  sviewCTL.run()
  
  orthot.loadScene = function(arg, loc) {
    let ekvx = arg
    if (typeof(arg) == "string") {    
      ekvx = assets[arg]
      if (ekvx == undefined) {  
        console.log(`No puzzle named "${arg}" to load...  Loading the default (MainArea)`)
        ekvx = assets.MainArea
      }
    }
    else if (!arg) {
      ekvx = assets.MainArea
    }
    if (orthot.ActiveZone) {
      renderCTL.display.scene.remove(orthot.ActiveZone.scene)
      orthot.ActiveZone.unload()
    }
    orthot.ActiveZone = new orthot.Zone(ekvx, loc)
    renderCTL.display.scene.add(orthot.ActiveZone.scene)
  }
  
  orthot.loadScene("MainArea")
  
  let resetELEM = $("<div>").addClass("btn_active").text("RESET").click(function() {
    if (orthot.ActiveZone) {
      orthot.ActiveZone.reset()
    }
  })
  $("#rightside").append(resetELEM)
  
  
  renderCTL.build_domOBJ = function(tile, color, location, css_class, event_handlers) {
    if (typeof(tile) == "string") {
      tile = orthot.tiles[tile]
    }
    if (!tile) {
      return
    }    
    if (!color) {
      color = new THREE.Color("white")
    }
    else if (!color.isColor) {
      color = new THREE.Color(color)
    }    
    if (!location) {
      location = "#leftside"
    }
    
    let cnv = document.createElement("canvas")
    let elem = $(cnv)
    if (css_class) {
      elem.addClass(css_class)
    }
    if (event_handlers) {
      for (let k in event_handlers) {
        elem.on(k, event_handlers[k])
      }
    }
    
    $(location).append(elem)
  
    cnv.width = UI_TILE_SIZE[0]
    cnv.height = UI_TILE_SIZE[1]
    
    //console.log(sz)
    let ctx = cnv.getContext('2d');
    ctx.shadowColor = 'rgba(0, 0, 0, .33333)';
    ctx.shadowOffsetX = UI_TILESHADOW_OFFSET[0]
    ctx.shadowOffsetY = UI_TILESHADOW_OFFSET[1]
    ctx.drawImage(tile.source, tile.x, tile.y, tile.w, tile.h, UI_TILEGRAPHIC_OFFSET[0], UI_TILEGRAPHIC_OFFSET[1], UI_TILEGRAPHIC_SIZE[0], UI_TILEGRAPHIC_SIZE[1]);
    
    let imgd = ctx.getImageData(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])
    let buf = imgd.data
    
    let r = color.r
    let g = color.g
    let b = color.b
    
    for (let i = 0; i < buf.length; i+= 4) {
      buf[i] =   buf[i]   * r
      buf[i+1] = buf[i+1] * g
      buf[i+2] = buf[i+2] * b
    }
    ctx.putImageData(imgd, 0, 0);
    return elem
  }
    
  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical 
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  let shownItem
  let tiptext = ""
  orthot.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      orthot.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }
  orthot.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }
  
  orthot.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
    }
  }
  
	var run = function run () {
		requestAnimationFrame( run );
		evtman.dispatch_libek_event("frame")
  	
  	if (orthot.ActiveZone) {  	 
  	  orthot.ActiveZone.onFrame()
  	}  	
	  renderCTL.display.render()
	  
	  let mpos3d = libek.pick.planepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
		libek.debug_tip(`${tiptext}<br>
		Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
	}	
	run()
  
  //console.log(assets)
})





















