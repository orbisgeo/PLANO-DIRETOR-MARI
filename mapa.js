// Importar a biblioteca proj4 para reprojetar coordenadas
function loadProj4(callback) {
  if (typeof proj4 !== 'undefined') {
    callback();
    return;
  }
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.6.2/proj4.js';
  script.onload = callback;
  document.head.appendChild(script);
}

// Criar camada base OSM
let osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
});

// Criar o mapa com CRS correto (EPSG:3857, padrão do OSM)
var map = L.map('map', {
  crs: L.CRS.EPSG3857,
  layers: [osm],
  maxZoom: 22 // Permite maior aproximação
}).setView([-23.5505, -46.6333], 13);

// Objetos para armazenar camadas carregadas
let camadasCarregadas = {};
let bounds = L.latLngBounds();
let feicaoSelecionada = null;

// Definir arquivos GeoJSON
const arquivosGeoJSON = {
  'Ruas': 'ruas.geojson',
  'UNIDADES DE SAÚDE': 'UNIDADES_SAUDE.geojson',
  'ESCOLAS': 'ESCOLAS.geojson',
  'LOTES': 'lotes_limpos.geojson',
  'Bairros': 'bairros.geojson',
};

// Função para converter coordenadas de EPSG:31985 para EPSG:4326 usando proj4
function projecao31985Para4326(x, y) {
  return proj4("EPSG:31985", "EPSG:4326", [x, y]);
}

// Função para definir estilos personalizados por camada
function getEstilo(nomeCamada) {
  const estilos = {
    'LOTES': { fillColor: 'white', color: 'grey', weight: 1, fillOpacity: 0.5 },
    'Ruas': { 
      color: 'black', 
      weight: window.innerWidth < 768 ? 6 : 3, // Aumenta espessura no mobile
      opacity: 0.8 
    },
    'Bairros': { fillColor: 'green', color: 'red', weight: 2, fillOpacity: 0.1 },
  };
  return estilos[nomeCamada] || { fillColor: 'blue', color: 'black', weight: 2, fillOpacity: 0.5 };
}

// Função para definir estilos de ponto personalizados
function getEstiloPonto(nomeCamada) {
  const estilosPonto = {
    'ESCOLAS': { radius: 6, color: 'blue', fillColor: 'lightblue', fillOpacity: 0.8 },
    'UNIDADES DE SAÚDE': { radius: 6, color: 'green', fillColor: 'lightgreen', fillOpacity: 0.8 }
  };
  return estilosPonto[nomeCamada] || { radius: 4, color: 'black', fillColor: 'grey', fillOpacity: 0.7 };
}

// Evento de clique e hover para melhorar a interação no mobile
function onEachFeature(feature, layer) {
  let popupContent = Object.keys(feature.properties)
    .map(key => `<b>${key}:</b> ${feature.properties[key]}`)
    .join('<br>');
  layer.bindPopup(popupContent);

  layer.on('click', function () {
    if (feicaoSelecionada) {
      feicaoSelecionada.setStyle(getEstilo(feicaoSelecionada.options.name) || {});
    }
    if (layer.setStyle) {
      layer.setStyle({
        weight: 8, 
        color: 'yellow',
        opacity: 1
      });
    }
    feicaoSelecionada = layer;
  });

  layer.on('mouseover', function () {
    this.previousStyle = this.options.style; 
    this.setStyle({ weight: 8, opacity: 1 });
  });

  layer.on('mouseout', function () {
    this.setStyle(this.previousStyle || getEstilo(this.options.name) || {});
  });
}

function carregarCamadas() {
  proj4.defs("EPSG:31985", "+proj=utm +zone=25 +south +datum=SIRGAS2000 +units=m +no_defs");

  let promises = Object.entries(arquivosGeoJSON).map(([nome, arquivo]) => {
    return fetch(arquivo)
      .then(response => response.json())
      .then(data => {
        let camada = L.geoJSON(data, {
          coordsToLatLng: function (coords) {
            let [lon, lat] = projecao31985Para4326(coords[0], coords[1]);
            return L.latLng(lat, lon);
          },
          style: nome === 'Ruas' || nome === 'Bairros' || nome === 'LOTES' ? getEstilo(nome) : undefined,
          pointToLayer: function (feature, latlng) {
            if (nome === 'ESCOLAS' || nome === 'UNIDADES DE SAÚDE') {
              return L.circleMarker(latlng, getEstiloPonto(nome));
            }
            return L.marker(latlng);
          },
          onEachFeature: onEachFeature
        });

        camada.addTo(map);
        camadasCarregadas[nome] = camada;

        camada.eachLayer(layer => {
          if (layer.getBounds) {
            bounds.extend(layer.getBounds());
          }
        });
      })
      .catch(error => console.error(`Erro ao carregar ${arquivo}:`, error));
  });

  Promise.all(promises).then(() => {
    L.control.layers({ 'OpenStreetMap': osm }, camadasCarregadas).addTo(map);
    if (bounds.isValid()) {
      map.fitBounds(bounds);
    }
  });
}

loadProj4(carregarCamadas);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(position => {
    let userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
    L.marker(userLatLng).addTo(map)
      .bindPopup("Você está aqui!").openPopup();
    map.setView(userLatLng, 15);
  }, error => {
    console.error("Erro ao obter localização: ", error);
  });
} else {
  console.error("Geolocalização não suportada pelo navegador.");
}

document.body.insertAdjacentHTML('beforeend', `
  <div style="position: absolute; top: 10px; left: 50px; z-index: 1000; background: white; padding: 10px; border-radius: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
    <input type="text" id="pesquisaLote" placeholder="Pesquisar Lote..." style="padding: 5px; width: 200px;">
    <button onclick="buscarLote()" style="padding: 5px;">Buscar</button>
    <div id="resultadosPesquisa" style="margin-top: 10px;"></div>
  </div>
`);

function buscarLote() {
  const termoPesquisa = document.getElementById('pesquisaLote').value.trim().toLowerCase();
  const resultadosDiv = document.getElementById('resultadosPesquisa');
  resultadosDiv.innerHTML = '';

  if (!termoPesquisa) {
    alert('Digite um termo para pesquisar.');
    return;
  }

  const camadaLotes = camadasCarregadas['LOTES'];
  if (!camadaLotes) {
    alert('A camada de lotes ainda não foi carregada.');
    return;
  }

  let lotesEncontrados = [];
  camadaLotes.eachLayer(layer => {
    const props = layer.feature.properties;
    for (let key in props) {
      if (props[key] && props[key].toString().toLowerCase().includes(termoPesquisa)) {
        lotesEncontrados.push({ layer, props });
        break;
      }
    }
  });

  if (lotesEncontrados.length > 0) {
    resultadosDiv.innerHTML = lotesEncontrados.map((item, index) => `
    <div class="resultado-lote" onclick="destacarOpcao(${index}, this)">
      <b>Lote:</b> ${item.props.NUMERO || 'S/N'} - <b>Logradouro:</b> ${item.props.LOGRADOURO || 'Desconhecido'}
    </div>
  `).join('');
  
    window.lotesEncontrados = lotesEncontrados;
  } else {
    alert('Lote não encontrado.');
  }
}

function centralizarLote(index) {
  const loteSelecionado = window.lotesEncontrados[index];

  if (feicaoSelecionada) {
    feicaoSelecionada.setStyle(getEstilo('LOTES'));
  }

  loteSelecionado.layer.setStyle({ color: 'red', weight: 4, fillOpacity: 0.7 });
  map.fitBounds(loteSelecionado.layer.getBounds());
  loteSelecionado.layer.openPopup();
  feicaoSelecionada = loteSelecionado.layer;
} 

function destacarOpcao(index, elemento) {
  // Remove o destaque de todas as opções
  document.querySelectorAll('.resultado-lote').forEach(el => {
    el.style.background = 'rgb(10, 174, 24)'; // Volta para a cor original
    el.style.color = 'white';
  });

  // Aplica o destaque na opção clicada
  elemento.style.background = 'yellow';
  elemento.style.color = 'black';

  // Centraliza o lote no mapa
  centralizarLote(index);
}
