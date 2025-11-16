from flask import Flask, jsonify, request
import firebase_admin
from firebase_admin import credentials, db
from flask_cors import CORS
import os 

# --- 1. FLASK SETUP ---
app = Flask(__name__)
CORS(app) 

# --- 2. FIREBASE SETUP ---
# IMPORTANT: REPLACE the placeholder with your actual Database URL!
DATABASE_URL = os.environ.get('FIREBASE_DB_URL', 'https://campus-resource-reservationapp-default-rtdb.firebaseio.com')

try:
    # This reads the serviceAccountKey.json file placed in the backend/ folder
    cred = credentials.Certificate('serviceAccountKey.json')
    
    firebase_admin.initialize_app(cred, {
        'databaseURL': DATABASE_URL 
    })
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"ERROR INITIALIZING FIREBASE: {e}")
    exit(1)

# --- 3. SAMPLE INITIAL DATA (USE FOR FIRST RUN ONLY) ---
def initialize_database():
    resources_ref = db.reference('resources')
    if resources_ref.get() is None:
        print("Populating initial resources...")
        initial_resources = {
            'res1': {'name': 'Seminar Hall A', 'location': 'Main Building', 'status': 'Available'},
            'res2': {'name': 'Computer Lab 301', 'location': 'Science Block', 'status': 'Available'},
            'res3': {'name': 'Volleyball Equipment', 'location': 'Sports Field', 'status': 'Available'}
        }
        resources_ref.set(initial_resources)
        print("Initial resources populated.")

# --- 4. API ROUTES ---

@app.route('/api/resources', methods=['GET'])
def list_resources():
    resources_ref = db.reference('resources')
    data = resources_ref.get()
    if not data: return jsonify([])
    resources_list = [{'id': key, **value} for key, value in data.items()]
    return jsonify(resources_list)

@app.route('/api/bookings', methods=['POST'])
def create_booking():
    data = request.get_json()
    required_fields = ['resource_id', 'date', 'time', 'purpose', 'user_id', 'user_email']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required booking fields'}), 400

    resource_data = db.reference(f'resources/{data["resource_id"]}').get()
    if not resource_data:
        return jsonify({'error': 'Resource not found'}), 404

    new_booking = {
        'resource_id': data['resource_id'],
        'resource_name': resource_data.get('name', 'Unknown Resource'),
        'date': data['date'], 'time': data['time'], 'purpose': data['purpose'],
        'user_id': data['user_id'], 'user_email': data['user_email'],
        'status': 'PENDING'
    }

    bookings_ref = db.reference('bookings')
    new_booking_ref = bookings_ref.push(new_booking)
    return jsonify({'message': 'Booking request submitted', 'id': new_booking_ref.key}), 201

@app.route('/api/bookings/pending', methods=['GET'])
def get_pending_bookings():
    bookings_ref = db.reference('bookings')
    data = bookings_ref.order_by_child('status').equal_to('PENDING').get()
    if not data: return jsonify([])
    pending_list = [{'id': key, **value} for key, value in data.items()]
    return jsonify(pending_list)

@app.route('/api/bookings/<booking_id>', methods=['PUT'])
def update_booking_status(booking_id):
    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['APPROVED', 'REJECTED']:
        return jsonify({'error': 'Invalid status. Must be APPROVED or REJECTED'}), 400
        
    booking_ref = db.reference(f'bookings/{booking_id}')
    try:
        booking_ref.update({'status': new_status})
        return jsonify({'message': f'Booking {booking_id} status updated to {new_status}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Uncomment initialize_database() ONLY ON THE FIRST RUN, then comment it out.
    # initialize_database()
    
    # Use a custom port (5001) to avoid conflict with 'firebase serve' (local testing)
    app.run(debug=True, port=5001)