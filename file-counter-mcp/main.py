# -*- coding: utf-8 -*-
"""
File Counter MCP for DStaff (安小龙)
Counts files in a given path (supports single files, directories, and Zip archives).
"""

import os
import zipfile
from typing import Dict, Any
from fastmcp import FastMCP, Context

mcp = FastMCP("File Counter 插件")

@mcp.tool()
async def count_files(file_path: str, ctx: Context = None, Context: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    统计输入路径中的文件总数。
    支持：单个文件、ZIP压缩包、文件夹。
    """
    result = {
        "success": False,
        "message": "",
        "file_count": 0,
        "details": ""
    }

    if not os.path.exists(file_path):
        result["message"] = f"文件/路径不存在: {file_path}"
        return result

    try:
        # Case 1: It's a ZIP file
        if zipfile.is_zipfile(file_path):
            with zipfile.ZipFile(file_path, 'r') as z:
                # Filter out directories if necessary, usually namelist includes dirs
                files = [f for f in z.namelist() if not f.endswith('/')]
                result["file_count"] = len(files)
                result["message"] = f"成功解析 ZIP 文件，共包含 {len(files)} 个文件。"
                result["details"] = f"ZIP: {file_path}"
                result["success"] = True

        # Case 2: It's a Directory
        elif os.path.isdir(file_path):
            count = 0
            for root, dirs, files in os.walk(file_path):
                count += len(files)
            result["file_count"] = count
            result["message"] = f"成功遍历文件夹，共包含 {count} 个文件。"
            result["details"] = f"Dir: {file_path}"
            result["success"] = True

        # Case 3: It's a Single File
        else:
            result["file_count"] = 1
            result["message"] = f"输入为单个文件，计数为 1。"
            result["details"] = f"File: {file_path}"
            result["success"] = True

    except Exception as e:
        result["message"] = f"处理过程中发生错误: {str(e)}"
        result["details"] = "Error"

    return result

if __name__ == "__main__":
    mcp.run(transport="sse", port=8002)
