
  if (!Module['expectedDataFileDownloads']) {
    Module['expectedDataFileDownloads'] = 0;
  }

  Module['expectedDataFileDownloads']++;
  (() => {
    // Do not attempt to redownload the virtual filesystem data when in a pthread or a Wasm Worker context.
    var isPthread = typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD;
    var isWasmWorker = typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER;
    if (isPthread || isWasmWorker) return;
    function loadPackage(metadata) {

      var PACKAGE_PATH = '';
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
      } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
        // web worker
        PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
      }
      var PACKAGE_NAME = 'en.data';
      var REMOTE_PACKAGE_BASE = 'en.data';
      if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
        Module['locateFile'] = Module['locateFilePackage'];
        err('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
      }
      var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];

      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        
        Module['dataFileDownloads'] ??= {};
        fetch(packageName)
          .catch((cause) => Promise.reject(new Error(`Network Error: ${packageName}`, {cause}))) // If fetch fails, rewrite the error to include the failing URL & the cause.
          .then((response) => {
            if (!response.ok) {
              return Promise.reject(new Error(`${response.status}: ${response.url}`));
            }

            if (!response.body && response.arrayBuffer) { // If we're using the polyfill, readers won't be available...
              return response.arrayBuffer().then(callback);
            }

            const reader = response.body.getReader();
            const iterate = () => reader.read().then(handleChunk).catch((cause) => {
              return Promise.reject(new Error(`Unexpected error while handling : ${response.url} ${cause}`, {cause}));
            });

            const chunks = [];
            const headers = response.headers;
            const total = Number(headers.get('Content-Length') ?? packageSize);
            let loaded = 0;

            const handleChunk = ({done, value}) => {
              if (!done) {
                chunks.push(value);
                loaded += value.length;
                Module['dataFileDownloads'][packageName] = {loaded, total};

                let totalLoaded = 0;
                let totalSize = 0;

                for (const download of Object.values(Module['dataFileDownloads'])) {
                  totalLoaded += download.loaded;
                  totalSize += download.total;
                }

                Module['setStatus']?.(`Downloading data... (${totalLoaded}/${totalSize})`);
                return iterate();
              } else {
                const packageData = new Uint8Array(chunks.map((c) => c.length).reduce((a, b) => a + b, 0));
                let offset = 0;
                for (const chunk of chunks) {
                  packageData.set(chunk, offset);
                  offset += chunk.length;
                }
                callback(packageData.buffer);
              }
            };

            Module['setStatus']?.('Downloading data...');
            return iterate();
          });
      };

      function handleError(error) {
        console.error('package error:', error);
      };

      var fetchedCallback = null;
      var fetched = Module['getPreloadedPackage'] ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;

      if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, (data) => {
        if (fetchedCallback) {
          fetchedCallback(data);
          fetchedCallback = null;
        } else {
          fetched = data;
        }
      }, handleError);

    function runWithFS(Module) {

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }
Module['FS_createPath']("/", "Maps", true, true);

      /** @constructor */
      function DataRequest(start, end, audio) {
        this.start = start;
        this.end = end;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function(mode, name) {
          this.name = name;
          this.requests[name] = this;
          Module['addRunDependency'](`fp ${this.name}`);
        },
        send: function() {},
        onload: function() {
          var byteArray = this.byteArray.subarray(this.start, this.end);
          this.finish(byteArray);
        },
        finish: function(byteArray) {
          var that = this;
          // canOwn this data in the filesystem, it is a slide into the heap that will never change
          Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
          Module['removeRunDependency'](`fp ${that.name}`);
          this.requests[this.name] = null;
        }
      };

      var files = metadata['files'];
      for (var i = 0; i < files.length; ++i) {
        new DataRequest(files[i]['start'], files[i]['end'], files[i]['audio'] || 0).open('GET', files[i]['filename']);
      }

      function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer.constructor.name === ArrayBuffer.name, 'bad input to processPackageData');
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // Reuse the bytearray from the XHR as the source for file reads.
          DataRequest.prototype.byteArray = byteArray;
          var files = metadata['files'];
          for (var i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }          Module['removeRunDependency']('datafile_en.data');

      };
      Module['addRunDependency']('datafile_en.data');

      if (!Module['preloadResults']) Module['preloadResults'] = {};

      Module['preloadResults'][PACKAGE_NAME] = {fromCache: false};
      if (fetched) {
        processPackageData(fetched);
        fetched = null;
      } else {
        fetchedCallback = processPackageData;
      }

    }
    if (Module['calledRun']) {
      runWithFS(Module);
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

    }
    loadPackage({"files": [{"filename": "/Maps/A Viking We Shall Go Allied.h3m", "start": 0, "end": 47439}, {"filename": "/Maps/A Viking We Shall Go.h3m", "start": 47439, "end": 94843}, {"filename": "/Maps/A Warm and Familiar Place.h3m", "start": 94843, "end": 104216}, {"filename": "/Maps/Adventures of Jared Haret.h3m", "start": 104216, "end": 114531}, {"filename": "/Maps/All for One.h3m", "start": 114531, "end": 143960}, {"filename": "/Maps/And One for All.h3m", "start": 143960, "end": 156705}, {"filename": "/Maps/Arrogance Allied.h3m", "start": 156705, "end": 168265}, {"filename": "/Maps/Arrogance.h3m", "start": 168265, "end": 179808}, {"filename": "/Maps/Ascension.h3m", "start": 179808, "end": 195886}, {"filename": "/Maps/Back For Revenge - Allied.h3m", "start": 195886, "end": 253998}, {"filename": "/Maps/Back For Revenge.h3m", "start": 253998, "end": 312095}, {"filename": "/Maps/Barbarian Breakout.h3m", "start": 312095, "end": 322129}, {"filename": "/Maps/Barbarian BreakoutA.h3m", "start": 322129, "end": 332252}, {"filename": "/Maps/Battle of the Sexes Allied.h3m", "start": 332252, "end": 371846}, {"filename": "/Maps/Battle of the Sexes.h3m", "start": 371846, "end": 411398}, {"filename": "/Maps/Brave New World(Allies).h3m", "start": 411398, "end": 452745}, {"filename": "/Maps/Brave New World.h3m", "start": 452745, "end": 494090}, {"filename": "/Maps/Buried Treasure.h3m", "start": 494090, "end": 520460}, {"filename": "/Maps/Carpe Diem - Allied.h3m", "start": 520460, "end": 549566}, {"filename": "/Maps/Carpe Diem.h3m", "start": 549566, "end": 578644}, {"filename": "/Maps/Caught in the Middle.h3m", "start": 578644, "end": 604994}, {"filename": "/Maps/Chasing a Dream.h3m", "start": 604994, "end": 614048}, {"filename": "/Maps/Crimson and Clover.h3m", "start": 614048, "end": 636770}, {"filename": "/Maps/Crimson and CloverA.h3m", "start": 636770, "end": 659599}, {"filename": "/Maps/Darwin's Prize(Allies).h3m", "start": 659599, "end": 680295}, {"filename": "/Maps/Darwin's Prize.h3m", "start": 680295, "end": 696970}, {"filename": "/Maps/Dawn of War.h3m", "start": 696970, "end": 715255}, {"filename": "/Maps/Dead and Buried.h3m", "start": 715255, "end": 725107}, {"filename": "/Maps/Deluge.h3m", "start": 725107, "end": 733292}, {"filename": "/Maps/Divided Loyalties.h3m", "start": 733292, "end": 766291}, {"filename": "/Maps/Divided LoyaltiesA.h3m", "start": 766291, "end": 799369}, {"filename": "/Maps/Dragon Orb.h3m", "start": 799369, "end": 827420}, {"filename": "/Maps/Dragon Pass (Allies).h3m", "start": 827420, "end": 854941}, {"filename": "/Maps/Dragon Pass.h3m", "start": 854941, "end": 882445}, {"filename": "/Maps/Dungeon Keeper.h3m", "start": 882445, "end": 894216}, {"filename": "/Maps/Dwarven Gold.h3m", "start": 894216, "end": 905493}, {"filename": "/Maps/Dwarven Tunnels(Allies).h3m", "start": 905493, "end": 933129}, {"filename": "/Maps/Dwarven Tunnels.h3m", "start": 933129, "end": 960749}, {"filename": "/Maps/Elbow Room(Allies).h3m", "start": 960749, "end": 965760}, {"filename": "/Maps/Elbow Room.h3m", "start": 965760, "end": 970756}, {"filename": "/Maps/Emerald Isles.h3m", "start": 970756, "end": 985356}, {"filename": "/Maps/Emerald IslesA.h3m", "start": 985356, "end": 999974}, {"filename": "/Maps/Faeries.h3m", "start": 999974, "end": 1032633}, {"filename": "/Maps/For Sale.h3m", "start": 1032633, "end": 1041067}, {"filename": "/Maps/Fort Noxis.h3m", "start": 1041067, "end": 1052819}, {"filename": "/Maps/Free for All.h3m", "start": 1052819, "end": 1098183}, {"filename": "/Maps/Freedom.h3m", "start": 1098183, "end": 1107238}, {"filename": "/Maps/Gelea's Champions (Allies).h3m", "start": 1107238, "end": 1142050}, {"filename": "/Maps/Gelea's Champions.h3m", "start": 1142050, "end": 1177123}, {"filename": "/Maps/Goblins in the Pantry.h3m", "start": 1177123, "end": 1196268}, {"filename": "/Maps/Golems Aplenty Allied.h3m", "start": 1196268, "end": 1222158}, {"filename": "/Maps/Golems Aplenty.h3m", "start": 1222158, "end": 1248035}, {"filename": "/Maps/Good Witch, Bad Witch.h3m", "start": 1248035, "end": 1282870}, {"filename": "/Maps/Good to Go.h3m", "start": 1282870, "end": 1287852}, {"filename": "/Maps/Gorlam's Tentacle Swampland.h3m", "start": 1287852, "end": 1308357}, {"filename": "/Maps/Hatchet Axe and Saw.h3m", "start": 1308357, "end": 1325406}, {"filename": "/Maps/Heroes of Might not Magic Allied.h3m", "start": 1325406, "end": 1357823}, {"filename": "/Maps/Heroes of Might not Magic.h3m", "start": 1357823, "end": 1390231}, {"filename": "/Maps/Hoard(Allies).h3m", "start": 1390231, "end": 1423387}, {"filename": "/Maps/Hoard.h3m", "start": 1423387, "end": 1456548}, {"filename": "/Maps/Hold the middle.h3m", "start": 1456548, "end": 1481397}, {"filename": "/Maps/Irrational Hostility.h3m", "start": 1481397, "end": 1490311}, {"filename": "/Maps/Island King Allied.h3m", "start": 1490311, "end": 1526096}, {"filename": "/Maps/Island King.h3m", "start": 1526096, "end": 1561862}, {"filename": "/Maps/Island of Fire.h3m", "start": 1561862, "end": 1586287}, {"filename": "/Maps/Islands and Caves.h3m", "start": 1586287, "end": 1625554}, {"filename": "/Maps/Jihad.h3m", "start": 1625554, "end": 1634277}, {"filename": "/Maps/Judgement Day.h3m", "start": 1634277, "end": 1639336}, {"filename": "/Maps/Just A Visit.h3m", "start": 1639336, "end": 1657570}, {"filename": "/Maps/Key to Victory.h3m", "start": 1657570, "end": 1666023}, {"filename": "/Maps/King of Pain.h3m", "start": 1666023, "end": 1687389}, {"filename": "/Maps/Kingdom for sale(allies).h3m", "start": 1687389, "end": 1725181}, {"filename": "/Maps/Kingdom for sale.h3m", "start": 1725181, "end": 1762960}, {"filename": "/Maps/Knee Deep in the Dead.h3m", "start": 1762960, "end": 1769869}, {"filename": "/Maps/Knight of Darkness.h3m", "start": 1769869, "end": 1797927}, {"filename": "/Maps/Land of Titans (Allied).h3m", "start": 1797927, "end": 1846938}, {"filename": "/Maps/Land of Titans.h3m", "start": 1846938, "end": 1895963}, {"filename": "/Maps/Last Chance Allies.h3m", "start": 1895963, "end": 1906004}, {"filename": "/Maps/Last Chance.h3m", "start": 1906004, "end": 1916010}, {"filename": "/Maps/Loss of Innocence(Allies).h3m", "start": 1916010, "end": 1946381}, {"filename": "/Maps/Loss of Innocence.h3m", "start": 1946381, "end": 1976688}, {"filename": "/Maps/Manifest Destiny.h3m", "start": 1976688, "end": 1986536}, {"filename": "/Maps/Marshland Menace.h3m", "start": 1986536, "end": 2012325}, {"filename": "/Maps/Meeting in Muzgob(Allies).h3m", "start": 2012325, "end": 2045208}, {"filename": "/Maps/Meeting in Muzgob.h3m", "start": 2045208, "end": 2078094}, {"filename": "/Maps/Merchant Princes Allied.h3m", "start": 2078094, "end": 2094585}, {"filename": "/Maps/Merchant Princes.h3m", "start": 2094585, "end": 2111057}, {"filename": "/Maps/Middletown.h3m", "start": 2111057, "end": 2152615}, {"filename": "/Maps/Monk's Retreat Allied.h3m", "start": 2152615, "end": 2203216}, {"filename": "/Maps/Monk's Retreat.h3m", "start": 2203216, "end": 2253791}, {"filename": "/Maps/Myth and Legend.h3m", "start": 2253791, "end": 2377134}, {"filename": "/Maps/Noahs Ark.h3m", "start": 2377134, "end": 2416041}, {"filename": "/Maps/One Bad Day - Allied.h3m", "start": 2416041, "end": 2437623}, {"filename": "/Maps/Overthrow Thy Neighbors.h3m", "start": 2437623, "end": 2464742}, {"filename": "/Maps/Pandora's Box .h3m", "start": 2464742, "end": 2587634}, {"filename": "/Maps/Peaceful Ending - Allied.h3m", "start": 2587634, "end": 2631750}, {"filename": "/Maps/Peaceful Ending.h3m", "start": 2631750, "end": 2675890}, {"filename": "/Maps/Peacemaker.h3m", "start": 2675890, "end": 2691223}, {"filename": "/Maps/Pestilence Lake Allies.h3m", "start": 2691223, "end": 2722358}, {"filename": "/Maps/Pestilence Lake.h3m", "start": 2722358, "end": 2753594}, {"filename": "/Maps/Pirates.h3m", "start": 2753594, "end": 2767504}, {"filename": "/Maps/Race for Ardintinny.h3m", "start": 2767504, "end": 2832810}, {"filename": "/Maps/Race for the Town.h3m", "start": 2832810, "end": 2850651}, {"filename": "/Maps/Ready or Not.h3m", "start": 2850651, "end": 2875115}, {"filename": "/Maps/Realm of Chaos.h3m", "start": 2875115, "end": 2910544}, {"filename": "/Maps/Realm of ChaosA.h3m", "start": 2910544, "end": 2946000}, {"filename": "/Maps/Rebellion.h3m", "start": 2946000, "end": 2964107}, {"filename": "/Maps/Reclamation Allied.h3m", "start": 2964107, "end": 3017557}, {"filename": "/Maps/Reclamation.h3m", "start": 3017557, "end": 3071002}, {"filename": "/Maps/Rediscovery.h3m", "start": 3071002, "end": 3105431}, {"filename": "/Maps/Resource War Allies.h3m", "start": 3105431, "end": 3127452}, {"filename": "/Maps/Resource War.h3m", "start": 3127452, "end": 3149464}, {"filename": "/Maps/Rise of the Phoenix Allied.h3m", "start": 3149464, "end": 3197168}, {"filename": "/Maps/Rise of the Phoenix.h3m", "start": 3197168, "end": 3244848}, {"filename": "/Maps/Rumble in the Bogs.h3m", "start": 3244848, "end": 3266982}, {"filename": "/Maps/Rumble in the BogsA.h3m", "start": 3266982, "end": 3289123}, {"filename": "/Maps/Sands of Blood.h3m", "start": 3289123, "end": 3296911}, {"filename": "/Maps/Sangraal's Thief Allied.h3m", "start": 3296911, "end": 3327382}, {"filename": "/Maps/Sangraal's Thief.h3m", "start": 3327382, "end": 3357833}, {"filename": "/Maps/Search for the Grail.h3m", "start": 3357833, "end": 3378731}, {"filename": "/Maps/Serpents Treasure.h3m", "start": 3378731, "end": 3440750}, {"filename": "/Maps/Shadow Valleys.h3m", "start": 3440750, "end": 3462801}, {"filename": "/Maps/South of Hell (Allies).h3m", "start": 3462801, "end": 3504602}, {"filename": "/Maps/South of Hell.h3m", "start": 3504602, "end": 3546447}, {"filename": "/Maps/Southern Cross.h3m", "start": 3546447, "end": 3585807}, {"filename": "/Maps/Step by Step (Allies).h3m", "start": 3585807, "end": 3613254}, {"filename": "/Maps/Step by Step.h3m", "start": 3613254, "end": 3640691}, {"filename": "/Maps/Tale of two lands (Allies).h3m", "start": 3640691, "end": 3713924}, {"filename": "/Maps/Tale of two lands.h3m", "start": 3713924, "end": 3787094}, {"filename": "/Maps/Terrible Rumor.h3m", "start": 3787094, "end": 3798495}, {"filename": "/Maps/The Battle of Daeyan's Ford.h3m", "start": 3798495, "end": 3850083}, {"filename": "/Maps/The Challenge.h3m", "start": 3850083, "end": 3870923}, {"filename": "/Maps/The Five Rings.h3m", "start": 3870923, "end": 3921195}, {"filename": "/Maps/The Gauntlet.h3m", "start": 3921195, "end": 3970166}, {"filename": "/Maps/The Great Race.h3m", "start": 3970166, "end": 3991867}, {"filename": "/Maps/The Mandate of Heaven.h3m", "start": 3991867, "end": 4062384}, {"filename": "/Maps/The Newcomers.h3m", "start": 4062384, "end": 4078312}, {"filename": "/Maps/Thousand Islands (allies).h3m", "start": 4078312, "end": 4129077}, {"filename": "/Maps/Thousand Islands.h3m", "start": 4129077, "end": 4179827}, {"filename": "/Maps/Time's Up.h3m", "start": 4179827, "end": 4190930}, {"filename": "/Maps/Titans Winter.h3m", "start": 4190930, "end": 4221304}, {"filename": "/Maps/Too Many Monsters.h3m", "start": 4221304, "end": 4228873}, {"filename": "/Maps/Tovar's Fortress (Allies).h3m", "start": 4228873, "end": 4258493}, {"filename": "/Maps/Tovar's Fortress.h3m", "start": 4258493, "end": 4288098}, {"filename": "/Maps/Treasure Hunt.h3m", "start": 4288098, "end": 4307936}, {"filename": "/Maps/Tutorial.tut", "start": 4307936, "end": 4314088}, {"filename": "/Maps/Twins.h3m", "start": 4314088, "end": 4326482}, {"filename": "/Maps/Undead Unrest.h3m", "start": 4326482, "end": 4353539}, {"filename": "/Maps/Unexpected Inheritance.h3m", "start": 4353539, "end": 4384243}, {"filename": "/Maps/Unholy Quest.h3m", "start": 4384243, "end": 4438199}, {"filename": "/Maps/Valleys of War.h3m", "start": 4438199, "end": 4470506}, {"filename": "/Maps/Vial of Life.h3m", "start": 4470506, "end": 4500758}, {"filename": "/Maps/War of the Mighty (Allies).h3m", "start": 4500758, "end": 4576447}, {"filename": "/Maps/War of the Mighty.h3m", "start": 4576447, "end": 4652105}, {"filename": "/Maps/Warlords.h3m", "start": 4652105, "end": 4677892}, {"filename": "/Maps/WarlordsA.h3m", "start": 4677892, "end": 4703858}, {"filename": "/Maps/Warmongers.h3m", "start": 4703858, "end": 4753294}, {"filename": "/Maps/When Dragons Clash.h3m", "start": 4753294, "end": 4778521}, {"filename": "/Maps/Wings of War.h3m", "start": 4778521, "end": 4792585}, {"filename": "/Maps/Xathras Prize.h3m", "start": 4792585, "end": 4838248}], "remote_package_size": 4838248});

  })();
