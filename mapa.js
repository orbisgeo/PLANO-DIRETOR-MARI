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
  layers: [osm]
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
    'Bairros': { fillColor: 'green', color: 'red', weight: 2, fillOpacity: 0.1 },
    'LOTES': { fillColor: 'white', color: 'grey', weight: 1, fillOpacity: 0.5 },
    'Ruas': { color: 'black', weight: 3 },
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

// Função para carregar camadas GeoJSON após o carregamento do proj4
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
            return L.marker(latlng); // Padrão para pontos que não tenham estilo definido
          },
          onEachFeature: function (feature, layer) {
            let popupContent = Object.keys(feature.properties)
              .map(key => `<b>${key}:</b> ${feature.properties[key]}`)
              .join('<br>');
            layer.bindPopup(popupContent);

            // Evento de clique para destacar a feição
            layer.on('click', function () {
              if (feicaoSelecionada) {
                feicaoSelecionada.setStyle(getEstilo(feicaoSelecionada.options.name) || {});
              }
              if (layer.setStyle) {
                layer.setStyle({
                  fillColor: 'yellow',
                  fillOpacity: 0.8,
                  color: 'red',
                  weight: 4
                });
              }
              feicaoSelecionada = layer;
            });
          }
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

// Carregar proj4 e depois as camadas
loadProj4(carregarCamadas);

// Marcar localização do usuário
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
