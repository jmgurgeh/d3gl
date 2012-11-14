// Jiwon Kim and Dan Posch
// {jiwonk, dcposch}@cs.stanford.edu
// CS448B Final Project

// See README.md for examples.


// check prerequisites 
if(!d3 || !jQuery || !THREE || !requestAnimationFrame){
    throw "D3GL requires D3, JQuery, ThreeJS, and RequestAnimationFrame";
}

d3.gl = {};
d3.gl.globe = function(){
    // PUBLIC PROPERTIES
    // viewport dimensions, in pixels
    var width = 400;
    var height = 400;
    // texture name
    var texture = '../img/earth-tex.png';
    // callbacks. data => lat, lon, etc
    var fnLat, fnLon, fnTex;
    // callbacks for choropleth map. data, country code => rgb color
    var fnChoropleth = true;
    // PRIVATE VARS
    var zoom = 2.0, rotation = [0, 0]; // azith, angle
	// constants
	var VIEW_ANGLE = 45,
	    NEAR = 0.01,
	    FAR = 100;
    var MOUSE_SENSITIVITY = [0.005, 0.005];
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var MIN_ZOOM = 0.5, MAX_ZOOM = 2;
    var COUNTRY_CODE_TEX = "../img/country-codes.png";

    var choroplethUtils = {
        loadShaders: function(callback) {
            $.get("../shaders/choropleth_fs.glsl", function(fs) {
                $.get("../shaders/choropleth_vs.glsl", function(vs) {
                    choroplethUtils.fs = fs;
                    choroplethUtils.vs = vs;
                    callback();
                });
            });
        },
        loadCountryCodeTexture: function(callback) {
            var codes = new Image();
            codes.onload = callback;
            codes.src = COUNTRY_CODE_TEX;
        },
        countryCodeFromColor: function(r, g, b) {
            return r*255*255 + g*255 + b;
        },
        colorOverlayFromCountryCode: function(code) {
            if(code==840) return {r: 255, g: 0, b: 0};
            return {r: 0, g: 0, b: 0};
        },
        createChoroplethTexture: function() {
            // create hidden canvas element for image pixel manipulation
            var canvas = document.createElement("canvas");
            canvas.width = 2048;
            canvas.height = 1024;

            var context = canvas.getContext("2d"); 
            context.drawImage(choroplethUtils.codes, 0, 0);
            var pixels = context.getImageData(0, 0, canvas.width, canvas.height);

            for (var y=0; y<canvas.height; y++) {
                for(var x=0; x<canvas.width; x++) {
                    var r, g, b, a;
                    var idx = (y*canvas.width + x)*4;

                    r = pixels.data[idx];
                    g = pixels.data[idx + 1];
                    b = pixels.data[idx + 2];
                    var countryCode = choroplethUtils.countryCodeFromColor(r, g, b);
                    var colorOverlay = choroplethUtils.colorOverlayFromCountryCode(countryCode);
                    pixels.data[idx] = colorOverlay.r;
                    pixels.data[idx + 1] = colorOverlay.g;
                    pixels.data[idx + 2] = colorOverlay.b;
                }
            }

            context.putImageData(pixels, 0, 0);

            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        },

        createMaterial: function(bgTexture) {
            var choroplethTexture = choroplethUtils.createChoroplethTexture();
            var vertexShader = choroplethUtils.vs;
            var fragmentShader = choroplethUtils.fs;
            var uniforms = {
                texture: {
                    type: "t",
                    value: THREE.ImageUtils.loadTexture(bgTexture)
                },
                choropleth: {
                    type: "t",
                    value: choroplethTexture
                }
            };
            var material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: uniforms,
            });

            return material;
        },
    }

    // sets up a ThreeJS globe
    function initGL(gl, tex){
        var scene = new THREE.Scene();

        // camera
        var camera = new THREE.PerspectiveCamera(
            VIEW_ANGLE, width/height,
            NEAR, FAR);
        camera.position.z = 2;
        scene.add(camera);

        // globe model
        var sphereMaterial;
        if(!fnChoropleth) {
            var texture = THREE.ImageUtils.loadTexture(tex);
            sphereMaterial = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                map: texture
            });
        } else {
            sphereMaterial = choroplethUtils.createMaterial(tex);
        }

        var radius = 1.0, segments = 80, rings = 40;
        var sphere = new THREE.Mesh(
           new THREE.SphereGeometry(radius, segments, rings),
           sphereMaterial);
        scene.add(sphere);

        // add a point light
        var pointLight = new THREE.PointLight( 0xFFFFFF );
        pointLight.position.x = 1;
        pointLight.position.y = 5;
        pointLight.position.z = 13;
        scene.add(pointLight);

        // start the renderer
        var renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setSize(width, height);

        gl.mesh = sphere;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
    }

    function initControls(elem){
        var dragStart;
        $(elem).mousedown(function(evt){
            dragStart = [evt.pageX, evt.pageY];
        }).mousemove(function(evt){
            if(!dragStart) return;
            update(evt);
            dragStart = [evt.pageX, evt.pageY];
        }).mouseup(function(evt){
            if(!dragStart) return;
            update(evt);
            dragStart = null;
        }).mousewheel(function(evt, delta, dx, dy){
            zoom *= Math.pow(1-ZOOM_SENSITIVITY, dy);
            zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
            evt.preventDefault();
        });
        function update(evt){
            rotation[1] += (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY[0]*zoom;
            rotation[0] += (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY[1]*zoom;
        }
    }

    // This is not quite as clean as
    // an external stylesheet, but simpler for
    // the end user.
    function initStyle(elem){
        elem.style.cursor = "pointer";
    }

    // renders. see http://bost.ocks.org/mike/chart/
    function globe(g){
        // render into each canvas
        g.each(function(d,i){
            var element = this;
            if(element.tagName == "canvas") throw "D3GL can only render into Canvas elements";
            var texture = fnTex(d);
            console.log("Rendering. "+
                "Dimensions: "+width+","+height+" "+
                "Texture: "+texture);
            
            function start() {
                // 3js state
                var gl = {};
                initGL(gl, texture);
                initControls(gl.renderer.domElement);
                initStyle(gl.renderer.domElement);
                element.appendChild(gl.renderer.domElement);
                
                // called 60 times per second
                function render(){
                    gl.mesh.rotation.x = rotation[0];
                    gl.mesh.rotation.y = rotation[1];
                    gl.camera.position.z = 1+zoom;
                    gl.renderer.render(gl.scene, gl.camera);
                    requestAnimationFrame(render);
                }
                render();
            }

            choroplethUtils.loadShaders(function() {
                choroplethUtils.loadCountryCodeTexture(function(ev) {
                    choroplethUtils.codes = ev.target;
                    start();
                });
            });
        });
    }
    globe.width = function(val){
        if(!arguments.length) return width;
        width = val;
        return globe;
    }
    globe.height = function(val){
        if(!arguments.length) return height;
        height = val;
        return globe;
    }
    globe.latitude= function(val){
        if(!arguments.length) return fnLat;  
        if(typeof val === "function") fnLat = val;
        else fnLat = function(){return val;}
        return globe;
    }
    globe.longitude= function(val){
        if(!arguments.length) return fnLon;  
        if(typeof val === "function") fnLon = val;
        else fnLon = function(){return val;}
        return globe;
    }
    globe.texture = function(val){
        if(!arguments.length) return texture;  
        if(typeof val === "function") fnTex = val;
        else fnTex = function(){return val;}
        return globe;
    }
    return globe;
};
