
    // 1. Configuração de Projeção SIRGAS 2000
    proj4.defs("EPSG:4674", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
    ol.proj.proj4.register(proj4);

    // 2. Camadas do Mapa
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
        renderMode: 'vector', 
        updateWhileAnimating: false,
        updateWhileInteracting: false,
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

    // 3. Atualizar Projeção
    document.getElementById('map-proj-selector').addEventListener('change', function(e) {
        const novaProj = e.target.value;
        const viewAtual = map.getView();
        const centro = viewAtual.getCenter();
        const zoom = viewAtual.getZoom();
        map.setView(new ol.View({ projection: novaProj, center: centro, zoom: zoom }));
        document.getElementById('current-epsg').innerText = novaProj;
    });

    // 4. Lógica de Interface
    let selectedFeature = null;
    let tableInstance = null;
    const bootstrapModal = new bootstrap.Modal(document.getElementById('dataModal'));

    function toggleModal() { bootstrapModal.show(); }

    function zoomToFeature(f) {
        if (!f) return;
        if (selectedFeature) selectedFeature.setStyle(undefined);
        f.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#FFEB3B', width: 4 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 235, 59, 0.4)' })
        }));
        selectedFeature = f;
        map.getView().fit(f.getGeometry().getExtent(), { duration: 1000, padding: [100, 100, 100, 100], maxZoom: 18 });
    }

    function showMiniPanel(f) {
        const content = document.getElementById('mini-content');
        const props = f.getProperties();
        let html = '<ul class="list-group list-group-flush">';
        for (let k in props) {
            if (k !== 'geometry' && k !== 'internalId') {
                html += `<li class="list-group-item px-0 py-1 border-0 bg-transparent">
                            <small class="text-muted d-block" style="font-size: 10px;">${k}</small>
                            <span class="fw-bold">${props[k] || '---'}</span>
                         </li>`;
            }
        }
        html += '</ul>';
        content.innerHTML = html;
        document.getElementById('mini-panel').style.display = 'flex';
        document.getElementById('btn-mini-zoom').onclick = () => zoomToFeature(f);
    }

    function closeMiniPanel() {
        document.getElementById('mini-panel').style.display = 'none';
        if (selectedFeature) selectedFeature.setStyle(undefined);
    }

    document.getElementById('layer-selector').addEventListener('change', (e) => {
        const val = e.target.value;
        layers.osm.setVisible(val === 'osm');
        layers.sat.setVisible(val === 'sat' || val === 'hybrid');
        layers.hybrid.setVisible(val === 'hybrid');
    });

    map.on('singleclick', (evt) => {
        const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { hitTolerance: 5 });
        if (feature) { zoomToFeature(feature); showMiniPanel(feature); } 
        else { closeMiniPanel(); }
    });

    // 5. Upload e Performance 
    document.getElementById('file-input').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Limpeza segura para performance
        if (tableInstance) { tableInstance.destroy(); tableInstance = null; }
        vectorSource.clear();

        const spinner = document.getElementById('spinner-load');
        const icon = document.getElementById('icon-upload');
        spinner.classList.remove('d-none');
        icon.classList.add('d-none');

        const reader = new FileReader();
        reader.onload = (event) => {
            shp(event.target.result).then((geojson) => {
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

                // Virtualização ativada para arquivos grandes
                tableInstance = new Tabulator("#table-container", {
                    data: data,
                    autoColumns: true,
                    layout: "fitColumns",
                    height: "60vh", 
                    virtualDom: true,
                    pagination: "local",
                    paginationSize: 20,
                    rowClick: (e, row) => {
                        const feat = vectorSource.getFeatures()[row.getData().id];
                        zoomToFeature(feat);
                        showMiniPanel(feat);
                        bootstrapModal.hide();
                    }
                });

                spinner.classList.add('d-none');
                icon.classList.remove('d-none');
            }).catch(err => {
                console.error(err);
                spinner.classList.add('d-none');
                icon.classList.remove('d-none');
                alert("Erro ao processar o arquivo.");
            });
        };
        renderVerticalBuffer: 300
        reader.readAsArrayBuffer(file);
    });
