"""Seed fixed Annasetu demo partners and sample donations into MySQL."""
from datetime import timedelta
import hashlib
from db import connect
from app import now_utc, event

DONORS = [
 ('D-001','Spice Route Kitchen','Restaurant','Bandra West','Hill Road, Bandra West, Mumbai 400050','+91 98200 10001'),
 ('D-002','Grand Lawns Events','Caterer','Andheri East','MIDC Road, Andheri East, Mumbai 400093','+91 98200 10002'),
 ('D-003','Daily Crumb Bakery','Bakery','Powai','Hiranandani Gardens, Powai, Mumbai 400076','+91 98200 10003'),
 ('D-004','Spice Route Banquets','Banquet hall','Lower Parel','Senapati Bapat Marg, Lower Parel, Mumbai 400013','+91 98200 10004'),
 ('D-005','BKC Corporate Cafeteria','Corporate cafeteria','Bandra Kurla Complex','G Block, Bandra Kurla Complex, Mumbai 400051','+91 98200 10005'),
 ('D-006','Sweet Haven Mithai','Sweet shop','Dadar','Gokhale Road, Dadar West, Mumbai 400028','+91 98200 10006')]
NGOS = [
 ('N-001','Seva Trust','Dharavi','90 Feet Road, Dharavi, Mumbai 400017',600,'+91 98300 20001'),
 ('N-002','Roti Bank','Kurla','LBS Marg, Kurla West, Mumbai 400070',400,'+91 98300 20002'),
 ('N-003','Sunrise Community Kitchen','Dharavi','Kumbharwada, Dharavi, Mumbai 400019',300,'+91 98300 20003')]
VOLS = [
 ('V-001','Rahul M.','two-wheeler','N-003'),('V-002','Priya S.','e-bike','N-001'),
 ('V-003','Imran K.','van','N-001'),('V-004','Anita D.','two-wheeler','N-002')]
SAMPLES = [
 ('D-006','Dessert boxes','sweets',1,35,9,-4200,'delivered','N-002','V-004'),
 ('D-005','Sandwich boxes','packed',1,100,25,-3900,'delivered','N-001','V-002'),
 ('D-004','Dal khichdi','cooked',1,70,28,-2500,'expired',None,None),
 ('D-002','Chicken pulao','cooked',0,150,60,-2600,'delivered','N-003','V-001'),
 ('D-003','Pav and buns','bakery',1,90,22,-900,'delivered','N-002','V-004'),
 ('D-001','Paneer curry and naan','cooked',1,50,18,-1000,'delivered','N-001','V-003'),
 ('D-005','Corporate lunch boxes','packed',1,80,32,-60,'delivered','N-002','V-004'),
 ('D-006','Assorted mithai','sweets',1,40,12,1440,'picked','N-001','V-002'),
 ('D-003','Bakery bread and buns','bakery',1,60,15,480,'claimed','N-001',None),
 ('D-001','Vegetable biryani','cooked',1,25,10,180,'enroute','N-003','V-001'),
 ('D-002','Wedding buffet: dal, rice, sabzi','cooked',1,300,110,25,'listed',None,None),
 ('D-004','Veg biryani and raita','cooked',1,120,48,210,'listed',None,None)]

def seed_database(reset=False):
    cn = connect(); cur = cn.cursor()
    cur.execute("SELECT COUNT(*) FROM partners"); count = cur.fetchone()[0]
    if count and not reset:
        cur.close(); cn.close(); print('Seed skipped: partner data already exists.'); return
    if reset:
        cur.execute('SET FOREIGN_KEY_CHECKS=0')
        for table in ('pickup_verifications','donation_events','donations','partners'):
            cur.execute(f'DELETE FROM {table}')
        cur.execute('SET FOREIGN_KEY_CHECKS=1')
    for p in DONORS:
        cur.execute("INSERT INTO partners(partner_id,name,role,partner_type,area,address,phone) VALUES(%s,%s,'donor',%s,%s,%s,%s)",p)
    for p in NGOS:
        cur.execute("INSERT INTO partners(partner_id,name,role,area,address,capacity,phone) VALUES(%s,%s,'ngo',%s,%s,%s,%s)",p)
    for pid,name,vehicle,ngo_id in VOLS:
        cur.execute("INSERT INTO partners(partner_id,name,role,partner_type,area,address,phone,vehicle,ngo_id) VALUES(%s,%s,'volunteer','Volunteer','Mumbai','Assigned to partner NGO','',%s,%s)",(pid,name,vehicle,ngo_id))
    now = now_utc(); month = now.strftime('%y%m')
    for i,s in enumerate(SAMPLES,1):
        donor,name,category,veg,meals,kg,remain,status,ngo_id,vol_id = s
        donation_id = f'DN-{month}-{i:03d}'
        code = 'AS-' + hashlib.sha256((donation_id + ('' if i == 1 else str(i))).encode()).hexdigest()[:6].upper()
        listed = now - timedelta(minutes=[5700,4300,2800,2900,1700,1500,300,120,70,45,30,20][i-1])
        expires = now + timedelta(minutes=remain)
        cur.execute("INSERT INTO donations(donation_id,qr_code,donor_id,ngo_id,volunteer_id,food_name,category,vegetarian,meals,weight_kg,listed_at,expires_at,eta_at,eta_total_ms,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
          (donation_id,code,donor,ngo_id,vol_id,name,category,veg,meals,kg,listed,expires,now+timedelta(minutes=8) if status=='enroute' else None,480000 if status=='enroute' else None,status))
        path = ['listed','expired'] if status == 'expired' else ['listed','claimed','enroute','picked','delivered'][:['listed','claimed','enroute','picked','delivered'].index(status)+1]
        for j,st in enumerate(path):
            actor = {'listed': next(x[1] for x in DONORS if x[0]==donor),'claimed': next((x[1] for x in NGOS if x[0]==ngo_id),'NGO'),'enroute': next((x[1] for x in VOLS if x[0]==vol_id),'Volunteer'),'picked': next((x[1] for x in VOLS if x[0]==vol_id),'NGO'),'delivered': next((x[1] for x in NGOS if x[0]==ngo_id),'NGO'),'expired':'System'}[st]
            event(cur,donation_id,st,actor,at=listed + (now-listed)*j/max(len(path)-1,1))
    cn.commit(); cur.close(); cn.close(); print('Seeded Annasetu partners and sample donations.')

if __name__ == '__main__': seed_database(reset=True)
