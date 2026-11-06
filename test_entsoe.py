import unittest,sys,pathlib,xml.etree.ElementTree as ET
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from entsoe_core import parse_points
class TestENTSOE(unittest.TestCase):
    def test_dam(self):
        xml='''<Publication_MarketDocument><TimeSeries><Period><timeInterval><start>2026-11-06T00:00Z</start></timeInterval><resolution>PT15M</resolution><Point><position>1</position><price.amount>-1.5</price.amount></Point><Point><position>2</position><price.amount>50</price.amount></Point></Period></TimeSeries></Publication_MarketDocument>'''
        rows=parse_points(ET.fromstring(xml),'dam')
        self.assertEqual([r['dam_eur_mwh'] for r in rows],[-1.5,50]);self.assertEqual(rows[1]['interval_minutes'],15)
    def test_generation(self):
        xml='''<GL_MarketDocument><TimeSeries><MktPSRType><psrType>B16</psrType></MktPSRType><Period><timeInterval><start>2026-11-06T00:00Z</start></timeInterval><resolution>PT60M</resolution><Point><position>1</position><quantity>123.5</quantity></Point></Period></TimeSeries><TimeSeries><MktPSRType><psrType>B14</psrType></MktPSRType><Period><timeInterval><start>2026-11-06T00:00Z</start></timeInterval><resolution>PT60M</resolution><Point><position>1</position><quantity>2000</quantity></Point></Period></TimeSeries></GL_MarketDocument>'''
        rows=parse_points(ET.fromstring(xml),'generation')
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['generation_mw']['solar'],123.5);self.assertEqual(rows[0]['generation_mw']['nuclear'],2000)
    def test_reject_ack(self):
        with self.assertRaises(ValueError):parse_points(ET.fromstring('<Acknowledgement_MarketDocument/>'),'generation')
if __name__=='__main__':unittest.main()
