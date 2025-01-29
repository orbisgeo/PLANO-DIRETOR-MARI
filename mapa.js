// Definir o CRS EPSG:31985
L.CRS.EPSG31985 = L.extend({}, L.CRS.Earth, {
  code: 'EPSG:31985',
  projection: L.Projection.Mercator,
  transformation: new L.Transformation(1 / 537948.5449223125, 0.5, -1 / 537948.5449223125, 0.5),
  scale: function (zoom) {
    return 256 * Math.pow(2, zoom);
  }
});

// Criar o mapa
var map = L.map('map', {
  crs: L.CRS.EPSG31985
}).setView([-23.5505, -46.6333], 13);

// Objetos para armazenar camadas carregadas
let camadasCarregadas = {};
let bounds = L.latLngBounds(); // Criar um objeto para armazenar os limites das camadas

// Definir arquivos GeoJSON
const arquivosGeoJSON = {
  'Bairros': 'bairros.geojson',
  'Lotes': 'lotes.geojson',
  'Ruas': 'ruas.geojson'
};

// Carregar e adicionar cada camada ao mapa
let promises = Object.entries(arquivosGeoJSON).map(([nome, arquivo]) => {
  return fetch(arquivo)
    .then(response => response.json())
    .then(data => {
      let camada = L.geoJSON(data, {
        coordsToLatLng: function (coords) {
          return L.CRS.EPSG31985.unproject(L.point(coords[0], coords[1]));
        },
        style: {
          fillColor: 'blue',
          fillOpacity: 0.5,
          color: 'black',
          weight: 2
        },
        onEachFeature: function (feature, layer) {
          let popupContent = Object.keys(feature.properties)
            .map(key => `<b>${key}:</b> ${feature.properties[key]}`)
            .join('<br>');
          layer.bindPopup(popupContent);
        }
      });

      // Atualizar os limites para centralizar todas as camadas
      camada.eachLayer(layer => {
        if (layer.getBounds) {
          bounds.extend(layer.getBounds());
        }
      });

      // Armazena a camada, mas não a adiciona ao mapa ainda
      camadasCarregadas[nome] = camada;
    })
    .catch(error => console.error(`Erro ao carregar ${arquivo}:`, error));
});

// Após carregar todas as camadas, adicionar ao controle de camadas e centralizar o mapa
Promise.all(promises).then(() => {
  L.control.layers(null, camadasCarregadas).addTo(map);
  
  // Ajustar a visualização para os limites das camadas carregadas
  if (bounds.isValid()) {
    map.fitBounds(bounds);
  }
});
