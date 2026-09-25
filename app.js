// Configurações do Supabase
var SUPABASE_URL = "https://neyplzldyvtyupgljict.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5leXBsemxkeXZ0eXVwZ2xqaWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDI2NDQsImV4cCI6MjEwNTA3ODY0NH0.5OYss0v6DWPGTHtS24I1cWlb_dLdgGSPQmjj9t04P5c";

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var map = null;
var loteLayer = null;
var verticesLayer = L.layerGroup(); 
var lpmLayer = L.layerGroup();
var ltmLayer = L.layerGroup();
var marinhaUnidaLayer = L.layerGroup(); 
var interseccaoLayer = L.layerGroup(); // Camada para o polígono roxo
var loteSelecionado = null;
var verticesSelecionados = [];

window.onload = () => {
  map = L.map('map').setView([-7.115, -34.863], 13);
  
  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps Satélite'
  }).addTo(map);

  verticesLayer.addTo(map);
  lpmLayer.addTo(map);
  ltmLayer.addTo(map);
  marinhaUnidaLayer.addTo(map); 
  interseccaoLayer.addTo(map); 

  var overlayMaps = {
    "Lotes da União": loteLayer ? loteLayer : L.layerGroup(),
    "LPM (Praiamar Média)": lpmLayer,
    "LTM (Terrenos de Marinha)": ltmLayer,
    "Área Calculada (Roxa)": interseccaoLayer
  };
  L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);

  console.log("🚀 VERSÃO 26: Polígono Roxo, Tooltips e Textos atualizados!");

  const inputBusca = document.getElementById('input-busca');
  if (inputBusca) {
    inputBusca.placeholder = "Digite o Codi_Lote ou Código Cartográfico";
    inputBusca.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') buscarPorTermo();
    });
  }

  carregarCamadasMarinha();
};

async function buscarPorTermo() {
  const inputBusca = document.getElementById('input-busca');
  if (!inputBusca) return;
  
  const termo = inputBusca.value.trim();
  if (!termo) {
    alert("Digite um código de lote para pesquisar.");
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.rpc('buscar_lote_exato', {
      p_codigo: termo
    });

    if (error) {
       console.error("Erro do Supabase:", error.message);
       alert("Ocorreu um erro ao comunicar com a base de dados.");
       return;
    }

    if (!data || data.length === 0) {
      alert(`Nenhum lote localizado com o código: "${termo}".`);
      limparCampos();
      return;
    }

    const row = data[0];
    
    let areaCalculada = 0;
    let geojsonInterseccao = null;
    
    try {
      const resUniao = await supabaseClient.rpc('calcular_area_uniao_lote', { p_codigo: termo });
      if (resUniao.data !== null && !isNaN(resUniao.data)) {
        areaCalculada = parseFloat(resUniao.data);
        
        if (areaCalculada > 0) {
            const resGeom = await supabaseClient.rpc('obter_geojson_uniao_lote', { p_codigo: termo });
            if (resGeom.data) {
                geojsonInterseccao = JSON.parse(resGeom.data);
            }
        }
      }
    } catch (e) {
      console.warn("Aviso ao processar área da União:", e);
    }
    
    const lote = {
      Codi_Lote: row.codi_lote || 'N/A',
      Desc_Logr: row.desc_logr || 'Desconhecido',
      area_m2: row.area_m2 || 0,
      area_uniao_m2: areaCalculada, 
      geom_wgs84: row.geom_wgs84,   
      geom_sirgas: row.geom_sirgas,
      geom_interseccao: geojsonInterseccao
    };

    desenharLoteNaTela(lote);

  } catch (err) {
    console.error("Erro na pesquisa:", err);
  }
}

async function carregarCamadasMarinha() {
  try {
    const resLpm = await supabaseClient.rpc('buscar_lpm');
    if (resLpm.data && Array.isArray(resLpm.data)) {
      resLpm.data.forEach(item => {
        if (item.geom_wgs84) {
          L.geoJSON(item.geom_wgs84, {
            style: { color: '#ef4444', weight: 3, opacity: 1 }
          })
          .bindTooltip("<b>LPM</b><br>Linha do Preamar Médio", { sticky: true })
          .addTo(lpmLayer);
        }
      });
    }

    const resLtm = await supabaseClient.rpc('buscar_ltm');
    if (resLtm.data && Array.isArray(resLtm.data)) {
      resLtm.data.forEach(item => {
        if (item.geom_wgs84) {
          L.geoJSON(item.geom_wgs84, {
            style: { color: '#facc15', weight: 3, opacity: 1 }
          })
          .bindTooltip("<b>LTM</b><br>Linha de Terrenos de Marinha", { sticky: true })
          .addTo(ltmLayer);
        }
      });
    }

    const resUnido = await supabaseClient.rpc('get_poligono_marinha_geojson');
    if (resUnido.data) {
      L.geoJSON(resUnido.data, {
        style: { color: 'transparent', weight: 0, fillColor: 'transparent', fillOpacity: 0 }
      }).addTo(marinhaUnidaLayer);
    }

  } catch (err) {
    console.error("Erro ao carregar camadas de marinha:", err);
  }
}

function calcularAzimute(deltaX, deltaY) {
  if (isNaN(deltaX) || isNaN(deltaY)) return "0° 0' 0\"";
  let azimuteRad = Math.atan2(deltaX, deltaY);
  let azimuteDeg = azimuteRad * (180 / Math.PI);
  if (azimuteDeg < 0) azimuteDeg += 360;
  
  const d = Math.floor(azimuteDeg);
  const minFloat = (azimuteDeg - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60);
  
  return `${d}° ${m}' ${s}"`;
}

function desenharLoteNaTela(lote) {
  loteSelecionado = lote;

  const campoProprietario = document.getElementById('txt-proprietario');
  if (campoProprietario) campoProprietario.innerText = lote.Desc_Logr || 'Proprietário não informado';
  document.getElementById('txt-rip').innerText = lote.Codi_Lote || 'N/A';
  
  const temAreaUniao = lote.area_uniao_m2 && lote.area_uniao_m2 > 0;
  
  const areaHTML = `
    <span style="display: block;">Total: ${lote.area_m2 || 0} m²</span>
    ${temAreaUniao ? 
      `<span style="display: block; color: #7e22ce; font-weight: bold; margin-top: 4px;">União: ${lote.area_uniao_m2} m²</span>` 
      : `<span style="display: block; color: #64748b; font-size: 0.85rem; margin-top: 4px; font-style: italic;">Este lote não possui área da União</span>`}
  `;
  document.getElementById('txt-area').innerHTML = areaHTML;

  if (loteLayer) map.removeLayer(loteLayer);
  verticesLayer.clearLayers();
  interseccaoLayer.clearLayers();
  verticesSelecionados = [];

  const tbody = document.getElementById('tbody-vertices');
  if (tbody) tbody.innerHTML = '';

  if (lote.geom_wgs84 && lote.geom_sirgas) {
    
    loteLayer = L.geoJSON(lote.geom_wgs84, {
      style: { color: '#2563eb', weight: 4, fillColor: '#3b82f6', fillOpacity: 0.5 }
    })
    .bindTooltip("<b>Lote (Área Total)</b><br>Limites do imóvel", { sticky: true })
    .addTo(map);
    
    map.fitBounds(loteLayer.getBounds(), { padding: [50, 50], maxZoom: 19 });

    if (lote.geom_interseccao) {
      L.geoJSON(lote.geom_interseccao, {
        style: { color: '#7e22ce', weight: 3, fillColor: '#a855f7', fillOpacity: 0.75 }
      })
      .bindTooltip("<b>Área da União</b><br>Intersecção com Terreno de Marinha", { sticky: true })
      .addTo(interseccaoLayer);
      
      interseccaoLayer.eachLayer(function (layer) {
          if (layer.bringToFront) layer.bringToFront();
      });
    }

    const geomType = lote.geom_sirgas.type;
    let pointIndex = 1;

    const processarAnel = (anelSirgas, anelWgs84) => {
      for (let i = 0; i < anelSirgas.length - 1; i++) {
        const ptSirgasAtual = anelSirgas[i];       
        const ptSirgasProximo = anelSirgas[i + 1]; 
        const ptWgs84Atual = anelWgs84[i];         

        const latlngAtual = [ptWgs84Atual[1], ptWgs84Atual[0]];
        const marcador = L.circleMarker(latlngAtual, {
          radius: 5, fillColor: "#ffffff", color: "#1e293b", weight: 2, fillOpacity: 1
        });
        marcador.bindTooltip(`<span style="font-size: 10px; font-weight: bold; color: #1e293b;">P${pointIndex}</span>`, { direction: 'top', offset: [0, -3] }).addTo(verticesLayer);

        const esteX = ptSirgasAtual[0].toFixed(2);
        const norteY = ptSirgasAtual[1].toFixed(2);
        const deltaX = ptSirgasProximo[0] - ptSirgasAtual[0];
        const deltaY = ptSirgasProximo[1] - ptSirgasAtual[1];
        const distanciaMts = Math.sqrt(deltaX * deltaX + deltaY * deltaY).toFixed(2);
        const azimuteStr = calcularAzimute(deltaX, deltaY);

        const vObj = {
          vertice_id: pointIndex,
          este_x: esteX,
          norte_y: norteY,
          distancia_m: distanciaMts,
          azimute_graus: azimuteStr
        };
        verticesSelecionados.push(vObj);

        if (tbody) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>P${vObj.vertice_id}</td>
            <td>${vObj.este_x}</td>
            <td>${vObj.norte_y}</td>
            <td>${vObj.distancia_m}</td>
            <td>${vObj.azimute_graus}</td>
          `;
          tbody.appendChild(tr);
        }
        pointIndex++;
      }
    };

    if (geomType === 'Polygon') {
      processarAnel(lote.geom_sirgas.coordinates[0], lote.geom_wgs84.coordinates[0]);
    } else if (geomType === 'MultiPolygon') {
      for (let p = 0; p < lote.geom_sirgas.coordinates.length; p++) {
        processarAnel(lote.geom_sirgas.coordinates[p][0], lote.geom_wgs84.coordinates[p][0]);
      }
    }
  }

  const btnExportar = document.getElementById('btn-exportar');
  if (btnExportar) btnExportar.disabled = false;
}

function limparCampos() {
  const campoProprietario = document.getElementById('txt-proprietario');
  if (campoProprietario) campoProprietario.innerText = '-';
  document.getElementById('txt-rip').innerText = '-';
  document.getElementById('txt-area').innerText = '0 m²';
  
  const tbody = document.getElementById('tbody-vertices');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="has-text-centered has-text-grey py-4">Nenhum lote selecionado.</td></tr>';
  
  if (loteLayer) map.removeLayer(loteLayer);
  verticesLayer.clearLayers();
  interseccaoLayer.clearLayers();
  
  loteSelecionado = null;
  verticesSelecionados = [];
}

async function gerarMemorialDocx() {
  if (!loteSelecionado || verticesSelecionados.length === 0) return;

  const { docx } = window;
  const linhasTabela = [
    new docx.TableRow({
      children: [
        new docx.TableCell({ children: [new docx.Paragraph({ text: "Vértice", bold: true })] }),
        new docx.TableCell({ children: [new docx.Paragraph({ text: "Este (X)", bold: true })] }),
        new docx.TableCell({ children: [new docx.Paragraph({ text: "Norte (Y)", bold: true })] }),
        new docx.TableCell({ children: [new docx.Paragraph({ text: "Distância (m)", bold: true })] }),
        new docx.TableCell({ children: [new docx.Paragraph({ text: "Azimute", bold: true })] }),
      ]
    })
  ];

  verticesSelecionados.forEach(v => {
    linhasTabela.push(
      new docx.TableRow({
        children: [
          new docx.TableCell({ children: [new docx.Paragraph(`P${v.vertice_id}`)] }),
          new docx.TableCell({ children: [new docx.Paragraph(`${v.este_x}`)] }),
          new docx.TableCell({ children: [new docx.Paragraph(`${v.norte_y}`)] }),
          new docx.TableCell({ children: [new docx.Paragraph(`${v.distancia_m || 0}`)] }),
          new docx.TableCell({ children: [new docx.Paragraph(`${v.azimute_graus}`)] }),
        ]
      })
    );
  });

  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({ text: "MEMORIAL DESCRITIVO", bold: true, size: 32, alignment: docx.AlignmentType.CENTER, spacing: { after: 300 } }),
        new docx.Paragraph({ text: `Denominação / Logradouro: ${loteSelecionado.Desc_Logr || 'Imóvel da União'}` }),
        new docx.Paragraph({ text: `Codi_Lote / RIP: ${loteSelecionado.Codi_Lote || 'N/A'}` }),
        new docx.Paragraph(`Área Total: ${loteSelecionado.area_m2 || 0} m²`),
        new docx.Paragraph({ text: `Sistema de Referência: SIRGAS 2000 / UTM zone 25S (EPSG: 31985)`, spacing: { after: 300 } }),
        new docx.Table({ rows: linhasTabela, width: { size: 100, type: docx.WidthType.PERCENTAGE } })
      ]
    }]
  });

  docx.Packer.toBlob(doc).then(blob => {
    saveAs(blob, `Memorial_${loteSelecionado.Codi_Lote || 'Lote'}.docx`);
  });
}
