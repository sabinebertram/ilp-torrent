const WebTorrent = require('../../../../lib/ilp-webtorrent')
const magnetURI = require('../../../../lib/ilp-magnet-uri')
const fetch = require('node-fetch')

const TRACKER = 'ENV_TRACKER'
const VERIFIER_APP = 'ENV_VERIFIER_SERVICE'

const client = new WebTorrent()

client.on('error', (error) => {
  console.log('client error', error)
})

var eventBus = new Vue()

Vue.component('seed', {
  template: `
    <div>
      <p>
        You may also seed your own file. To do so, you will have to create a proxy payment
        pointer at a receipt STREAM receipt verifier. You have two options to do that:
        <ol>
          <li> host your own <a href="https://github.com/coilhq/receipt-verifier" target="_blank">STREAM receipt verifier</a>, or
          <li> create a proxy at our <a href="${VERIFIER_APP}" target="_blank">STREAM receipt verifier service</a>.
        </ol> 
        When seeding the file, make sure to choose the currency your payment pointer is denoted in, since the 
        tracker does not do conversion yet. Also, we are assuming the receipts to have an asset scale of 9.
      <p>
      <form class="seed-form" @submit.prevent="onSubmit">

        <div class="row">
          <div class="six columns">
            <label for="paymentPointer">Proxy Payment Pointer</label>
            <input class="u-full-width" id="paymentPointer" v-model="paymentPointer" type="text" placeholder="$test.spsp.example.com" required>
          </div>
          <div class="six columns">
            <label for="verifier">Verifier Endpoint</label>
            <input class="u-full-width" id="verifier" v-model="verifier" type="text" placeholder="verifier.example.com" required>
          </div>
        </div>

        <div class="row">
          <div class="six columns">
            <label for="amount">Price</label>
            <input class="u-full-width" id="amount" v-model="amount" type="number" placeholder="0.00000" min="0" step="0.00001" required>
          </div>
          <div class="six columns">
            <label for="asset">Currency</label>
            <select class="u-full-width" id="asset" v-model="asset">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="XRP">XRP</option>
              <option value="BTC">BTC</option>
            </select>
          </div>
        </div>

        <div class="row">
          <div class="six columns">
            <label for="file">File</label>
            <input class="u-full-width" id="file" type="file" v-on:change="selectedFile($event)" required>
          </div>
          <div class="six columns">
            <label for="name">Name (optional)</label>
            <input class="u-full-width" id="name" v-model="name" type="text" placeholder="epic-video" pattern="^[a-zA-Z0-9\-]*$">
          </div>

          <div>
            <input type="submit" value="Submit">  
          </div>    
        </div>
      </form>
    </div>
    `,
  data () {
    return {
      name: null,
      paymentPointer: null,
      verifier: null,
      amount: null,
      asset: 'USD',
      file: null,
      extension: null
    }
  },
  methods: {
    selectedFile (event) {
      this.file = event.target.files[0]
      this.extension = this.file.name.split('.').slice(-1)
    },
    onSubmit () {
      const info = {
        name: this.name ? `${this.name}.${this.extension}` : file.name,
        private: true,
        announce: TRACKER,
        paymentRequired: true,
        license: {
          paymentPointer: this.paymentPointer,
          verifier: this.verifier,
          amount: this.amount,
          asset: this.asset
        },
        requestId: ''
      }
      this.seed(info)
      this.name = null
      this.paymentPointer = null
      this.verifier = null
      this.amount = null
      this.asset = null
      this.file = null
      this.extension = null
    },
    seed (info) {
      client.seed(this.file, info, function (torrent) {
        eventBus.$emit('seed-successful', torrent.magnetURI)
      })
    }
  }

})

Vue.component('seeded', {
  props: {
    magnet: {
      required: false
    }
  },
  template: `
  <div>
    <p>Your magnet URI is:</p>
    <p style="word-break: break-all;"><strong>{{ magnet }}</strong></p>
  </div>
  `
})

Vue.component('leech', {
  template: `
  <div class="leech">
    <div v-show="view === 'monetizationCheck'">
      <div class="warning">
        <p> 
          You need to enable Web Monetization to leech a file. 
          Check out <a href="https://webmonetization.org">webmonetization.org</a>
          and <a href="https://coil.com">Coil</a> to learn more.
        </p>
      </div>
    </div>
    <div v-show="view === 'request'">
      <leechRequest></leechRequest>
    </div>
    <div v-show="view === 'fund'">
      <fund :verifier="verifier"></fund>
    </div>
    <div v-show="view === 'leeched'">
      <leeched></leeched>
    </div>
  </div>
  `,
  data () {
    return {
      view: 'monetizationCheck',
      receipts: [],
      magnet: null,
      verifier: null,
      requestId: null,
      credit: false
    }
  },
  methods: {
    creditReceipt ({ requestId, receipt }) {
      const endpoint = new URL(this.verifier.endsWith('/')
        ? `${this.verifier}balances/${requestId}:creditReceipt`
        : `${this.verifier}/balances/${requestId}:creditReceipt`)

      fetch(endpoint.href, { method: 'POST', body: receipt })
        .then(res => {
          if (!res.ok) {
            console.log(`Credit receipt error: ${res.status} ${res.statusText}`)
          } else {
            if (this.credit === false) this.credit = true
          }
        })
    },
    leechFile () {
      const opts = {
        requestId: this.requestId
      }
      client.add(this.magnet, opts)
      client.on('error', (error) => {
        console.log('leech error', error)
      })
      client.on('torrent', (torrent) => {
        const file = torrent.files[0]
        eventBus.$emit('file')
        file.appendTo('#fileCompleted')
      })
    },
    checkMonetization () {
      if (document.monetization) this.view = 'request'
    }
  },
  mounted () {
    this.checkMonetization()
    document.monetization.addEventListener('monetizationprogress', (event) => {
      this.requestId = event.detail.requestId
      const receipt = event.detail.receipt
      this.receipts.push({ requestId: this.requestId, receipt })
    })
    eventBus.$on('decoded-license', (obj) => {
      this.view = 'fund'
      this.magnet = obj.magnet
      this.verifier = obj.license.verifier
    })
    eventBus.$on('file', () => {
      this.view = 'leeched'
      this.credit = false
      this.magnetURI = null
      this.verifier = null
      this.requestId = null
    })
  },
  watch: {
    receipts: function (arr) {
      if (arr.length > 0 && this.verifier != null) {
        this.creditReceipt(arr[0])
        this.receipts.shift()
      }
    },
    credit: function (val) {
      if (val === true) {
        this.leechFile()
      }
    }
  }
})

Vue.component('leechRequest', {
  template: `
  <div>
    <p>
      With the Coil extension enabled, try leeching our demo file by pasting the following magnet URI:
      <pre>
        <code>magnet:?xt=urn:btih:db848ee06597d3bf410ce25ab7319cacd8c6c031&dn=podcast-dark-2.png&tr=ws%3A%2F%2Flocalhost%3A8000&pp=http%3A%2F%2Flocalhost%3A4001%2Fspsp%2F~niq&vr=http%3A%2F%2Flocalhost%3A4002</code>
      </pre>
    </p>
    <p>
      The file costs 0.01 USD so it will take a little bit to gather the funds before you are able to see it. 
    </p>
    <form class="leech-form" @submit.prevent="onSubmit">
      <label for="magnet">Magnet URI</label>
      <input class="u-full-width" id="magnet" v-model.trim="magnet" type="text" placeholder="magnet:" required>
      <input type="submit" value="Submit">  
    </form>
   </div>
  `,
  data () {
    return {
      magnet: null
    }
  },
  methods: {
    onSubmit () {
      const decodedMagnet = magnetURI.decode(this.magnet)
      eventBus.$emit('decoded-license', { magnet: this.magnet, license: decodedMagnet.license })
      this.magnet = null
    }
  }
})

Vue.component('fund', {
  props: {
    verifier: {
      required: false
    }
  },
  template: `
  <div>
    <p>Loading... Waiting for sufficient funds...</p>
  </div>
  `
})

Vue.component('leeched', {
  template: `
  <div>
    <p>Here is your file: </p>
    <div id="fileCompleted"></div>
  </div>
  `
})

Vue.component('tabs', {
  template: `
    <div>
    
      <ul>
        <span class="tabs button" 
              :class="{ 'button-primary': selectedTab === tab }"
              v-for="(tab, index) in tabs"
              @click="selectedTab = tab"
              :key="tab"
        >{{ tab }}</span>
      </ul>

      <div v-show="selectedTab === 'Seed'">
        <div v-show="seedView === 'seed'">
          <seed></seed>
        </div>
        <div v-show="seedView === 'seeded'">
          <seeded :magnet="magnet"></seeded>
        </div>
      </div>

      <div v-show="selectedTab === 'Leech'">
        <leech></leech>
      </div>
  
    </div>
  `,
  data () {
    return {
      tabs: ['Leech', 'Seed'],
      selectedTab: 'Leech',
      seedView: 'seed',
      magnet: null
    }
  },
  mounted () {
    eventBus.$on('seed-successful', magnet => {
      this.magnet = magnet
      this.seedView = 'seeded'
    })
  }
})

var app = new Vue({
  el: '#app',
  data: {

  },
  methods: {
  }
})

var head = new Vue({
  el: 'head',
  methods: {
    addMeta(pointer) {
      const meta = document.createElement('meta')
      meta.name = 'monetization'
      meta.content = pointer
      document.getElementsByTagName('head')[0].appendChild(meta)
    },
    removeMeta() {
      const meta = document.getElementsByName("monetization")[0]
      meta.remove()
    },
  },
  mounted () {
    eventBus.$on('decoded-license', obj => {
      this.addMeta(obj.license.paymentPointer)
    })
    eventBus.$on('file', () => {
      this.removeMeta()
    })
  }
})
