/**
 * Service Layer (Web Worker)
 * 负责处理钉钉 AI 表格数据交互与附件解压逻辑
 */

try {
  importScripts('./jszip.min.js');
} catch (e) {
  importScripts('https://unpkg.com/jszip@3.10.1/dist/jszip.min.js');
}

const OFFICE_DOC_EXTS = new Set([
  'doc',
  'docx',
  'wps',
  'xls',
  'xlsx',
  'et',
  'ppt',
  'pptx',
  'dps',
  'pdf',
  'txt',
  'md',
  'rtf',
  'csv',
  'ofd'
]);

function getFileExt(fileName) {
  if (!fileName) return '';
  const baseName = String(fileName).split('/').pop() || '';
  const dotIdx = baseName.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === baseName.length - 1) return '';
  return baseName.slice(dotIdx + 1).toLowerCase();
}

function isOfficeDoc(fileNameOrPath) {
  const ext = getFileExt(fileNameOrPath);
  if (!ext) return false;
  return OFFICE_DOC_EXTS.has(ext);
}

function shouldIgnoreZipEntry(path) {
  if (!path) return true;
  if (path.startsWith('__MACOSX/')) return true;
  const baseName = String(path).split('/').pop() || '';
  const lower = baseName.toLowerCase();
  if (lower === '.ds_store' || lower === 'thumbs.db') return true;
  return false;
}

async function countZipOfficeDocs(fileUrl) {
  const response = await fetch(fileUrl, { credentials: 'include' });
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  const zip = await JSZip.loadAsync(blob);
  return Object.keys(zip.files).filter((path) => {
    const entry = zip.files[path];
    if (!entry || entry.dir) return false;
    if (shouldIgnoreZipEntry(path)) return false;
    return isOfficeDoc(path);
  }).length;
}

DingdocsScript.registerScript('getSheetFields', async () => {
  const sheet = DingdocsScript.base.getActiveSheet();
  const fields = await sheet.getFields();
  return fields.map((f) => ({
    id: f.getId(),
    name: typeof f.getName === 'function' ? f.getName() : f.name,
    type: typeof f.getType === 'function' ? f.getType() : f.type,
    index: typeof f.getIndex === 'function' ? f.getIndex() : f.columnIndex
  }));
});

/**
 * 注册插件核心功能：统计附件文件数
 * UI 层通过 Dingdocs.script.run('countAttachmentFiles', params) 调用此函数
 */
DingdocsScript.registerScript('countAttachmentFiles', async (params) => {
  try {
    // 1. 获取当前激活的 Sheet
    const sheet = DingdocsScript.base.getActiveSheet();
    const selection = sheet.getSelection();
    
    // 2. 获取选区范围
    const ranges = selection.getRanges();
    if (!ranges || ranges.length === 0) {
      throw new Error("请先在表格中框选包含附件的单元格区域");
    }

    const attachmentFieldId = params && params.attachmentFieldId ? String(params.attachmentFieldId).trim() : '';
    const outputFieldId = params && params.outputFieldId ? String(params.outputFieldId).trim() : '';
    const outputFieldName = params && params.outputFieldName ? String(params.outputFieldName).trim() : '';
    let totalCount = 0;
    const errors = [];
    const rowCountMap = new Map();
    
    // 3. 建立列索引到字段对象的映射
    const fields = await sheet.getFields();
    const fieldMap = {};
    fields.forEach(f => {
      // 兼容不同 SDK 版本获取列索引的方法
      const idx = typeof f.getIndex === 'function' ? f.getIndex() : f.columnIndex;
      fieldMap[idx] = f;
    });

    let attachmentFieldIndex = null;
    if (attachmentFieldId) {
      const f = fields.find((x) => x.getId() === attachmentFieldId);
      if (!f) {
        errors.push(`⚠️ 未找到你选择的附件字段，已按选区内全部附件列统计`);
      } else if (f.getType() !== 'attachment') {
        errors.push(`⚠️ 你选择的字段不是附件类型，已按选区内全部附件列统计`);
      } else {
        attachmentFieldIndex = typeof f.getIndex === 'function' ? f.getIndex() : f.columnIndex;
      }
    }

    const shouldWriteBack = Boolean(outputFieldId || outputFieldName);

    // 4. 遍历选区内的每一行
    for (const range of ranges) {
      const startRow = range.getStartRow();
      const endRow = range.getEndRow();
      const startCol = range.getStartCol();
      const endCol = range.getEndCol();

      // 获取选中区域的记录
      // 注意：getRecords 的具体参数可能因 SDK 版本略有不同，通常支持 (row, count) 或 (startRow, endRow)
      // 此处假设支持获取指定范围的记录。若 API 限制只能全量获取，需在此处做过滤
      const records = await sheet.getRecords(startRow, endRow - startRow + 1);

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rowNumber = startRow + i;
        let rowDocCount = 0;
        const shouldCollectPerRow = shouldWriteBack;

        // 遍历选中的列范围
        const colStart = attachmentFieldIndex === null ? startCol : attachmentFieldIndex;
        const colEnd = attachmentFieldIndex === null ? endCol : attachmentFieldIndex;

        for (let col = colStart; col <= colEnd; col++) {
          const field = fieldMap[col];
          
          // 仅处理附件类型字段 (type 通常为 'attachment')
          if (!field || field.getType() !== 'attachment') continue;
          if (attachmentFieldId && field.getId() !== attachmentFieldId) continue;

          // 获取单元格值，附件通常返回数组格式：[{fileName, downloadUrl, ...}]
          const cellValue = record.getValue(field.getId());
          if (!Array.isArray(cellValue)) continue;

          // 遍历该单元格的所有附件
          for (const file of cellValue) {
            const fileName = file.fileName || file.name || '';
            const fileUrl = file.downloadUrl || file.url;

            if (getFileExt(fileName) === 'zip') {
              if (!fileUrl) {
                errors.push(`⚠️ 文件 [${fileName}] 无下载链接`);
                continue;
              }

              try {
                const zipDocCount = await countZipOfficeDocs(fileUrl);
                totalCount += zipDocCount;
                rowDocCount += zipDocCount;
              } catch (e) {
                console.error(`解压失败：${fileName}`, e);
                errors.push(`⚠️ 解析 ZIP [${fileName}] 失败，未计入其中的文档数`);
              }
            } else {
              if (!isOfficeDoc(fileName)) continue;
              totalCount += 1;
              rowDocCount += 1;
            }
          }
        }

        if (shouldCollectPerRow) {
          const prev = rowCountMap.get(rowNumber);
          rowCountMap.set(rowNumber, { record, value: (prev ? prev.value : 0) + rowDocCount });
        } else if (rowDocCount > 0) {
          const prev = rowCountMap.get(rowNumber);
          rowCountMap.set(rowNumber, { record, value: (prev ? prev.value : 0) + rowDocCount });
        }
      }
    }

    if (shouldWriteBack) {
      const resolvedOutputField = outputFieldId
        ? fields.find((f) => f.getId() === outputFieldId)
        : fields.find((f) => {
            const name = typeof f.getName === 'function' ? f.getName() : f.name;
            return name === outputFieldName;
          });

      if (!resolvedOutputField) {
        errors.push(`⚠️ 未找到你选择的写回字段，已仅在插件内展示统计结果`);
        return {
          success: true,
          total: totalCount,
          errors: errors
        };
      }

      const outputFieldLabel = typeof resolvedOutputField.getName === 'function'
        ? resolvedOutputField.getName()
        : resolvedOutputField.name;
      const outputFieldIdResolved = resolvedOutputField.getId();

      for (const range of ranges) {
        const startRow = range.getStartRow();
        const endRow = range.getEndRow();
        for (let row = startRow; row <= endRow; row++) {
          if (!rowCountMap.has(row)) {
            rowCountMap.set(row, { record: null, value: 0 });
          }
        }
      }

      for (const [rowNumber, info] of rowCountMap.entries()) {
        try {
          let record = info.record;
          const value = info.value;

          if (!record) {
            const rs = await sheet.getRecords(rowNumber, 1);
            record = rs && rs[0];
          }

          let written = false;
          if (record && typeof record.setValue === 'function') {
            record.setValue(outputFieldIdResolved, value);
            if (typeof record.save === 'function') {
              await record.save();
              written = true;
            } else if (typeof sheet.updateRecords === 'function') {
              await sheet.updateRecords([record]);
              written = true;
            }
          }

          if (!written) {
            const recordId = record && (typeof record.getId === 'function' ? record.getId() : record.id);
            if (recordId && typeof sheet.updateRecord === 'function') {
              await sheet.updateRecord(recordId, { [outputFieldIdResolved]: value });
              written = true;
            }
          }

          if (!written) {
            errors.push(`⚠️ 第 ${rowNumber} 行写回到 [${outputFieldLabel}] 失败：当前环境未暴露可用的写入 API`);
          }
        } catch (e) {
          errors.push(`⚠️ 第 ${rowNumber} 行写回失败：${e && e.message ? e.message : '未知错误'}`);
        }
      }

      return {
        success: true,
        total: totalCount,
        errors: errors
      };
    }

    return {
      success: true,
      total: totalCount,
      errors: errors
    };

  } catch (error) {
    return {
      success: false,
      message: error.message,
      total: 0
    };
  }
});
