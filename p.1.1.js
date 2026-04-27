document.addEventListener('DOMContentLoaded', () => {
    // 1. Configuração de Projeção SIRGAS 2000
    proj4.defs("EPSG:4674", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
    ol.proj.proj4.register(proj4);

    // 2. Camadas do Mapa com Otimização de Renderização
    const layers = {
        osm: new ol.layer.Tile({ source: new ol.source.OSM(), visible: true }),
        sat: new ol.layer.Tile({ 
            source: new ol.source.XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' }),
            visible: false 
        }),
        hybrid: new ol.layer.Tile({
            source: new ol.source.XYZ({ url: 'https://{a-c}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png' }),
            visible: false
        })
    };

    const vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        renderMode: 'vector', // Garante precisão no clique
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#00FF00', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(0, 255, 0, 0.15)' })
        })
    });

    const map = new ol.Map({
        target: 'map',
        layers: [layers.osm, layers.sat, layers.hybrid, vectorLayer],
        view: new ol.View({ projection: 'EPSG:4674', center: [-50, -15], zoom: 4 })
    });

    // 3. Funções Globais (Expostas para o HTML)
    window.toggleModal = () => { new bootstrap.Modal(document.getElementById('dataModal')).show(); };

    // 4. Lógica de Upload e Processamento
    document.getElementById('file-input').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const spinner = document.getElementById('spinner-load');
        spinner.classList.remove('d-none');

        const reader = new FileReader();
        reader.onload = (event) => {
            shp(event.target.result).then((geojson) => {
                vectorSource.clear();
                const features = new ol.format.GeoJSON().readFeatures(geojson, { 
                    featureProjection: map.getView().getProjection() 
                });
                
                vectorSource.addFeatures(features);
                map.getView().fit(vectorSource.getExtent(), { padding: [50, 50, 50, 50], duration: 1200 });
                
                const data = features.map((f, i) => {
                    f.set('internalId', i);
                    const { geometry, ...props } = f.getProperties();
                    return { id: i, ...props };
                });

                // Virtualização ativada para arquivos grandes (VIRTUAL DOM)
                tableInstance = new Tabulator("#table-container", {
                    data: data,
                    autoColumns: true,
                    layout: "fitColumns",
                    height: "60vh", 
                    virtualDom: true, 
                    pagination: "local",
                    paginationSize: 50,
                    rowClick: (e, row) => {
                        const feat = vectorSource.getFeatures()[row.getData().id];
                        map.getView().fit(feat.getGeometry().getExtent(), { duration: 1000, padding: [100, 100, 100, 100] });
                        bootstrap.Modal.getInstance(document.getElementById('dataModal')).hide();
                    }
                });

                spinner.classList.add('d-none');
            }).catch(err => {
                console.error(err);
                spinner.classList.add('d-none');
                alert("Erro ao processar arquivo pesado.");
            });
        };
        reader.readAsArrayBuffer(file);
    });
});
