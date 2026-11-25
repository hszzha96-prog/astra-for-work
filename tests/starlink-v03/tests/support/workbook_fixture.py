"""Generate synthetic OOXML workbooks and expose ElementTree to the Node test DOM."""
import io
import json
import sys
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"
MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml"


def sheet_xml(rows):
    sheet = ET.Element("worksheet", xmlns=SHEET)
    data = ET.SubElement(sheet, "sheetData")
    for index, values in enumerate(rows, 1):
        row = ET.SubElement(data, "row", r=str(index))
        for column, value in values.items():
            if value is None:
                continue
            ref = column + str(index)
            if isinstance(value, str):
                cell = ET.SubElement(row, "c", r=ref, t="inlineStr")
                ET.SubElement(ET.SubElement(cell, "is"), "t").text = value
            else:
                cell = ET.SubElement(row, "c", r=ref)
                ET.SubElement(cell, "v").text = str(value)
    return sheet


def workbook(spec):
    buf = io.BytesIO()
    compression = ZIP_DEFLATED if spec["compressed"] else ZIP_STORED
    with ZipFile(buf, "w", compression=compression) as arch:
        book = ET.Element("workbook", xmlns=SHEET, attrib={"xmlns:r": OFFICE})
        sheets = ET.SubElement(book, "sheets")
        book_rels = ET.Element("Relationships", xmlns=REL)
        package_rels = ET.Element("Relationships", xmlns=REL)
        ET.SubElement(package_rels, "Relationship", Id="rBook", Type=OFFICE + "/officeDocument", Target="xl/workbook.xml")
        types = ET.Element("Types", xmlns=TYPES)
        ET.SubElement(types, "Default", Extension="rels", ContentType="application/vnd.openxmlformats-package.relationships+xml")
        ET.SubElement(types, "Default", Extension="xml", ContentType="application/xml")
        ET.SubElement(types, "Override", PartName="/xl/workbook.xml", ContentType=MIME + ".sheet.main+xml")
        for index, (name, rows) in enumerate(spec["sheets"].items(), 1):
            rid, target = f"rSheet{index}", f"worksheets/sheet{index}.xml"
            ET.SubElement(sheets, "sheet", name=name, sheetId=str(index), attrib={"r:id": rid})
            ET.SubElement(book_rels, "Relationship", Id=rid, Type=OFFICE + "/worksheet", Target=target)
            ET.SubElement(types, "Override", PartName="/xl/" + target, ContentType=MIME + ".worksheet+xml")
            arch.writestr("xl/" + target, ET.tostring(sheet_xml(rows), encoding="utf-8"))
        for name, root in [("xl/workbook.xml", book), ("xl/_rels/workbook.xml.rels", book_rels),
                           ("_rels/.rels", package_rels), ("[Content_Types].xml", types)]:
            arch.writestr(name, ET.tostring(root, encoding="utf-8"))
    return buf.getvalue()


def xml_node(el):
    return {
        "name": el.tag.rsplit("}", 1)[-1],
        "attributes": [[key.rsplit("}", 1)[-1], value] for key, value in el.attrib.items()],
        "text": "".join(el.itertext()),
        "children": [xml_node(child) for child in el],
    }


if __name__ == "__main__":
    if sys.argv[1] == "xlsx":
        sys.stdout.buffer.write(workbook(json.load(sys.stdin)))
    elif sys.argv[1] == "xml":
        json.dump(xml_node(ET.fromstring(sys.stdin.buffer.read())), sys.stdout, ensure_ascii=True)
    else:
        raise ValueError("Expected xlsx or xml")
